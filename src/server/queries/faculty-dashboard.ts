import "server-only";
import { currentReleasedCandidates } from "../recommendation-scope";
import type { Prisma } from "../../generated/prisma/client";
import type { AccountUser } from "../account-auth";
import { getPrisma } from "../prisma";
import { getRelevantFacultyCycles } from "./configuration";
import { facultyEligibility, type EvaluationStatus } from "../services/faculty-evaluation";
import { selectedFacultyCycle, selectedFacultyObservation } from "../faculty-context";

type Database = Prisma.TransactionClient;
type CycleRow = { id: string; name: string; semesterId: string; semester: string; termCode: string; startsOn: string | null; endsOn: string | null; timeZone: string; signupDeadline: Date; observationDeadline: Date; feedbackDeadline: Date };
type EvaluationRow = { hiringLevel: string; intervalYears: number; hireDate: Date | null; teachingTerms: string[]; observationId: string | null; completedAt: Date | null; semesterId: string | null; semester: string | null; termCode: string | null };
type ObservationRow = { id: string; status: string; participation: "observee" | "observer"; course: string; section: string; scheduledAt: Date | null };

export type FacultyDashboard = {
  asOf: string;
  hasFacultyProfile: boolean;
  hasCurrentSignup: boolean | null;
  cycleReason: string | null;
  availableCycles: { id: string; name: string }[];
  availableObservations: { id: string; label: string }[];
  cycle: (Omit<CycleRow, "signupDeadline" | "observationDeadline" | "feedbackDeadline"> & { signupDeadline: string; observationDeadline: string; feedbackDeadline: string }) | null;
  evaluation: { status: EvaluationStatus; reason: string; canSignUp?: boolean; hiringLevel: string | null; lastCompletedEvaluation: { observationId: string; completedAt: string; semesterId: string; semester: string } | null };
  currentObservation: (Omit<ObservationRow, "scheduledAt"> & { scheduledAt: string | null }) | null;
  pendingObserverRequestCount: number | null;
  recentActivity: { id: string; title: string; message: string; createdAt: string }[];
  access: { evaluation: boolean; observations: boolean; activity: boolean };
};

export class DashboardForbidden extends Error {}

/** Only call with the identity freshly resolved by existing Auth.js server helpers. */
export async function getFacultyDashboard(user: AccountUser, options: { now?: Date; database?: Database; cycleId?: string | null; observationId?: string | null } = {}): Promise<FacultyDashboard> {
  if (!user.permissions.includes("profile.read.own")) throw new DashboardForbidden("Forbidden");
  const now = options.now ?? new Date();
  const access = {
    evaluation: user.permissions.includes("evaluation-status.read.own"),
    observations: user.permissions.includes("observations.read.own"),
    activity: user.permissions.includes("notifications.read.own"),
  };
  const result: FacultyDashboard = {
    asOf: now.toISOString(), hasFacultyProfile: false, hasCurrentSignup: null, cycle: null, cycleReason: null, availableCycles: [], availableObservations: [],
    evaluation: { status: "unknown", reason: access.evaluation ? "No faculty profile is available." : "Evaluation status is not available with your current permissions.", hiringLevel: null, lastCompletedEvaluation: null },
    currentObservation: null, pendingObserverRequestCount: access.observations ? 0 : null,
    recentActivity: [], access,
  };
  // Reserved development users have no database UUID/profile. Never map one to a seeded account.
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(user.id)) return result;
  const db = options.database ?? getPrisma();
  const profile = await db.professor.findUnique({ where: { userId: user.id } });
  const professorId = profile?.professorId;
  result.hasFacultyProfile = !!professorId;

  if (professorId) {
    const cycles = await getRelevantFacultyCycles(db, user, now);
    result.availableCycles = cycles.map(cycle => ({ id: cycle.cycleId, name: cycle.semester.termName }));
    const chosen = options.cycleId === undefined ? await selectedFacultyCycle() : options.cycleId;
    const selected = chosen ? cycles.find(cycle => cycle.cycleId === chosen) ?? null : cycles.length === 1 ? cycles[0] : null;
    const cycle: CycleRow | null = selected && selected.signupDeadline < selected.observationDeadline && selected.observationDeadline < selected.feedbackDeadline
      ? { id: selected.cycleId, name: selected.cycleName, semesterId: selected.semesterId,
        semester: selected.semester.termName, termCode: selected.semester.termCode,
        startsOn: selected.semester.startsOn?.toISOString().slice(0, 10) ?? null,
        endsOn: selected.semester.endsOn?.toISOString().slice(0, 10) ?? null, timeZone: selected.semester.timeZone,
        signupDeadline: selected.signupDeadline, observationDeadline: selected.observationDeadline, feedbackDeadline: selected.feedbackDeadline } : null;
    result.cycleReason = cycle ? null : cycles.length > 1 ? "Choose a relevant evaluation cycle to continue."
      : "No single valid relevant evaluation cycle is available.";
    if (!cycle && (cycles.length > 1 || chosen || selected)) result.pendingObserverRequestCount = null;
    if (cycle) result.cycle = { ...cycle, signupDeadline: cycle.signupDeadline.toISOString(), observationDeadline: cycle.observationDeadline.toISOString(), feedbackDeadline: cycle.feedbackDeadline.toISOString() };
    if (cycle && user.permissions.includes("signups.read.own")) {
      result.hasCurrentSignup = !!await db.evaluationSignup.findFirst({
        where: { cycleId: cycle.id, professor: { userId: user.id } }, select: { signupId: true },
      });
    }

    if (access.evaluation) {
      const profile = await db.professor.findUnique({ where: { professorId, userId: user.id }, include: { hiringLevel: true, teaches: { include: { section: { include: { semester: true } } } } } });
      const completed = await db.observation.findMany({ where: { signup: { professorId }, signedAssessment: { is: { isLocked: true, observerSignedAt: { not: null }, observeeSignedAt: { not: null } } } }, include: { signedAssessment: true, cycle: { include: { semester: true } } } });
      const completion = (record: typeof completed[number]) => record.signedAssessment!.completedAt ?? record.completedAt ?? new Date(Math.max(record.signedAssessment!.observerSignedAt!.getTime(), record.signedAssessment!.observeeSignedAt!.getTime()));
      completed.sort((a,b) => completion(b).getTime() - completion(a).getTime() || a.observationId.localeCompare(b.observationId));
      const last = completed[0];
      const row: EvaluationRow | null = profile ? { hiringLevel: profile.hiringLevel.levelName, intervalYears: profile.hiringLevel.evaluationIntervalYears, hireDate: profile.hireDate, teachingTerms: [...new Set(profile.teaches.map(item => item.section.semester.termCode))], observationId: last?.observationId ?? null, completedAt: last ? completion(last) : null, semesterId: last?.cycle.semesterId ?? null, semester: last?.cycle.semester.termName ?? null, termCode: last?.cycle.semester.termCode ?? null } : null;
      if (row) {
        result.evaluation = { ...facultyEligibility(cycle, row.termCode, row.intervalYears, row.hireDate, row.teachingTerms ?? []), hiringLevel: row.hiringLevel,
          lastCompletedEvaluation: row.observationId && row.completedAt && row.semesterId && row.semester
            ? { observationId: row.observationId, completedAt: row.completedAt.toISOString(), semesterId: row.semesterId, semester: row.semester } : null };
      }
      if (!cycle) result.evaluation.reason = result.cycleReason!;
    }

    if (cycle && access.observations) {
      const records = await db.observation.findMany({ where: { cycleId: cycle.id, OR: [{ signup: { professorId } }, { observerId: professorId }], status: { notIn: ["CANCELLED", "CANCELED", "NOT_OCCURRED"] } }, include: { signup: { include: { section: { include: { course: true } } } } }, orderBy: [{ scheduledAt: { sort: "asc", nulls: "last" } }, { signup: { signupDate: "desc" } }, { observationId: "asc" }] });
      records.sort((a,b) => Number(b.signup.professorId === professorId) - Number(a.signup.professorId === professorId));
      const observations = { rows: records.map(record => ({ id: record.observationId, status: record.status, participation: record.signup.professorId === professorId ? "observee" as const : "observer" as const, course: record.signup.section.course.courseCode, section: record.signup.section.sectionCode, scheduledAt: record.scheduledAt })) };
      const pendingCount = await db.observationCandidate.count({ where: { ...currentReleasedCandidates, professorId, status: "PENDING", invitedAt: { lte: now }, respondedAt: null, expiresAt: { gt: now }, observation: { cycleId: cycle.id, signup: { professorId: { not: professorId } }, observerId: null, completedAt: null, cycle: { observationDeadline: { gt: now } }, status: { notIn: ["COMPLETED", "CANCELLED", "CANCELED", "NOT_OCCURRED"] }, NOT: { signedAssessment: { is: { isLocked: true, observerSignedAt: { not: null }, observeeSignedAt: { not: null } } } } } } });
      const pending = { rows: [{ count: pendingCount }] };
      result.availableObservations = observations.rows.map(record => ({ id: record.id, label: `${record.course}.${record.section} · ${record.participation}` }));
      const selectedId = options.observationId === undefined ? await selectedFacultyObservation() : options.observationId;
      const observation = observations.rows.find(record => record.id === selectedId) ?? observations.rows[0];
      if (observation) result.currentObservation = { ...observation, scheduledAt: observation.scheduledAt?.toISOString() ?? null };
      result.pendingObserverRequestCount = pending.rows[0]?.count ?? 0;
    }
  }

  if (access.activity) {
    const notifications = await db.notification.findMany({ where: { userId: user.id, inAppEnabled: true }, orderBy: [{ createdAt: "desc" }, { notificationId: "asc" }], take: 5 });
    const activity = { rows: notifications.map(row => ({ id: row.notificationId, title: row.title, message: row.message, createdAt: row.createdAt })) };
    result.recentActivity = activity.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }
  return result;
}
