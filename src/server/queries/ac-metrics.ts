import type { Prisma } from "../../generated/prisma/client";
import { availableOption, observerAvailable, workflowObservation } from "../services/faculty-invitations";
import { FacultyActionError } from "../services/faculty-errors";

type Connection = Pick<Prisma.TransactionClient, "evaluationSignup" | "observation" | "professor">;
const cancelled = ["CANCELLED", "CANCELED"];
const signupInclude = {
  professor: { include: { user: { select: { userId: true, fullName: true } } } },
  section: { include: { course: true } },
  observations: { include: { signedAssessment: true, candidates: { include: { attempts: true } },
    facultyIssues: { where: { kind: "NOT_OCCURRED" } }, processFeedback: true } },
};
type Signup = Prisma.EvaluationSignupGetPayload<{ include: typeof signupInclude }>;
type Observation = Signup["observations"][number];
type Faculty = { id: string; evaluationStatus: string };

export function cycleSignups(db: Connection, cycleId: string, filters: { departmentId?: string | null; hiringLevelId?: string | null }) {
  return db.evaluationSignup.findMany({ where: { cycleId, professor: {
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.hiringLevelId ? { hiringLevelId: filters.hiringLevelId } : {}),
  } }, include: signupInclude, orderBy: { signupId: "asc" } });
}

export function completedObservation(o: Pick<Observation, "signedAssessment">) {
  const a = o.signedAssessment;
  return !!(a?.isLocked && a.observerSignedAt && a.observeeSignedAt);
}

export function pendingStage(o: Observation, now: Date) {
  if (o.status === "NOT_OCCURRED" || o.facultyIssues.length) return "reported-not-occurred";
  if (!o.observerId) return "awaiting-observer";
  if (!o.scheduledAt) return "awaiting-appointment";
  if (o.scheduledAt > now) return "upcoming";
  if (!o.signedAssessment?.observerSignedAt) return "awaiting-observer-submission";
  if (!o.signedAssessment.observeeSignedAt) return "awaiting-observee-acknowledgement";
  return "awaiting-finalization";
}

function metric(key: string, label: string, numerator: number, denominator: number | null, unit = "percent", unavailableReason?: string) {
  const reason = unavailableReason ?? (denominator === 0 ? "No eligible denominator records are available." : undefined);
  return { key, label, numerator, denominator, unit,
    value: reason ? null : denominator === null ? numerator : Math.round(numerator / denominator * (unit === "percent" ? 100 : 1) * 100) / 100,
    ...(reason ? { unavailableReason: reason } : {}) };
}

export async function cycleMetrics(db: Connection, cycle: Prisma.EvaluationCycleGetPayload<{ include: { semester: true } }>,
  signups: Signup[], faculty: Faculty[], baseline: Faculty[], now: Date) {
  const observations = signups.flatMap(s => s.observations.filter(o => !cancelled.includes(o.status)));
  const signedUp = new Set(signups.map(s => s.professorId)).size;
  const due = baseline.filter(p => p.evaluationStatus === "due").length;
  const overdue = faculty.filter(p => p.evaluationStatus === "overdue").length;
  const observers = new Set(observations.flatMap(o => o.observerId ? [o.observerId] : [])).size;
  const missing = observations.filter(o => o.observerId && o.scheduledAt && (o.status === "NOT_OCCURRED" || o.facultyIssues.length)).length;
  const surveyed = signups.filter(s => s.observations.some(o => !cancelled.includes(o.status) && o.observerId && o.scheduledAt
    && completedObservation(o) && o.completedAt && o.signedAssessment?.completedAt && o.candidates.some(c => c.invitedAt || c.attempts.length)
    && o.processFeedback.some(f => f.professorId === s.professorId && f.feedbackRole === "OBSERVEE" && f.submittedAt))).length;

  let matches = 0, generated = 0, notGenerated = 0, ambiguous = 0;
  for (const signup of signups) {
    const lists = signup.observations.filter(o => !cancelled.includes(o.status) && o.recommendationGenerationId);
    if (lists.length > 1) { ambiguous++; continue; }
    if (!lists.length) { notGenerated++; continue; }
    generated++;
    matches += new Set(lists[0].candidates.map(c => c.professorId)).size;
  }

  // Recheck retained pairs using the actual Faculty matching/availability service.
  // Past meetings remain checkable; this is current-data validation, not a snapshot.
  let checked = 0, valid = 0;
  for (const observation of observations) {
    if (!observation.candidates.length) continue;
    const record = await workflowObservation(db, observation.observationId);
    for (const professorId of new Set(observation.candidates.map(c => c.professorId))) {
      checked++;
      for (const option of record.timeOptions) {
        try {
          if (await observerAvailable(db, record, professorId, availableOption(record, option.timeOptionId, new Date(0)))) {
            valid++; break;
          }
        } catch (error) { if (!(error instanceof FacultyActionError)) throw error; }
      }
    }
  }

  return { cycleId: cycle.cycleId, available: true, source: "database", availableAt: cycle.feedbackDeadline,
    generatedAt: now, formulaVersion: "kpi-2026-10-26", reportingMode: "live-recalculation",
    definitions: {
      eligibility: "Retained recommendation pairs rechecked against current matching rules and schedules; historical generation snapshots are unavailable.",
      participation: "Due population reconstructed from evaluations before this cycle using current rank and shared eligibility. Voluntary signups can exceed 100%; no historical eligibility snapshot exists.",
      history: "Values remain live recalculations after the feedback deadline; they are not immutable final reports.",
    },
    counts: { signups: signedUp, needsReview: faculty.filter(p => p.evaluationStatus === "needs-review").length,
      baselineNeedsReview: baseline.filter(p => p.evaluationStatus === "needs-review").length,
      generatedLists: generated, notGeneratedLists: notGenerated, ambiguousLists: ambiguous },
    metrics: [
      metric("evaluationEligibilityAccuracy", "Evaluation eligibility accuracy", valid, checked),
      metric("overdueEvaluationCount", "Overdue evaluations", overdue, null, "count"),
      metric("assessmentParticipationRate", "Participation rate", signedUp, due),
      metric("observerUtilizationRate", "Observer utilization", observers, signedUp),
      metric("listSufficiencyRate", "Average matches per signup", matches, signedUp, "matches",
        ambiguous ? "Multiple generated observations exist for a signup; the applicable list requires review."
          : notGenerated ? "Recommendation generation has not finished for every signup." : undefined),
      metric("missingObservationCount", "Reported missing observations", missing, null, "count"),
      metric("surveyCompletionRate", "Survey completion", surveyed, signups.length),
    ] };
}
