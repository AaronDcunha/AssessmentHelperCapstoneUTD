import "server-only";
import type { QueryResultRow } from "pg";
import type { AccountUser } from "../account-auth";
import { getPool } from "../db";
import { getPrisma } from "../prisma";
import { getRelevantFacultyCycles } from "./configuration";
import { facultyEligibility, type EvaluationStatus } from "../services/faculty-evaluation";
import { selectedFacultyCycle, selectedFacultyObservation } from "../faculty-context";

type Database = { query<Row extends QueryResultRow>(sql: string, values: unknown[]): Promise<{ rows: Row[] }> };
type CycleRow = { id: string; name: string; semesterId: string; semester: string; termCode: string; startsOn: string | null; endsOn: string | null; timeZone: string; signupDeadline: Date; observationDeadline: Date; feedbackDeadline: Date };
type EvaluationRow = { hiringLevel: string; intervalYears: number; hireDate: Date | null; teachingTerms: string[]; observationId: string | null; completedAt: Date | null; semesterId: string | null; semester: string | null; termCode: string | null };
type ObservationRow = { id: string; status: string; participation: "observee" | "observer"; course: string; section: string; scheduledAt: Date | null };
type ActivityRow = { id: string; title: string; message: string; createdAt: Date };

export type FacultyDashboard = {
  asOf: string;
  hasFacultyProfile: boolean;
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
    asOf: now.toISOString(), hasFacultyProfile: false, cycle: null, cycleReason: null, availableCycles: [], availableObservations: [],
    evaluation: { status: "unknown", reason: access.evaluation ? "No faculty profile is available." : "Evaluation status is not available with your current permissions.", hiringLevel: null, lastCompletedEvaluation: null },
    currentObservation: null, pendingObserverRequestCount: access.observations ? 0 : null,
    recentActivity: [], access,
  };
  // Reserved development users have no database UUID/profile. Never map one to a seeded account.
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(user.id)) return result;
  const db = options.database ?? getPool();
  const profile = await db.query<{ professorId: string }>(`
    SELECT professor_id AS "professorId" FROM public.professor WHERE user_id = $1`, [user.id]);
  const professorId = profile.rows[0]?.professorId;
  result.hasFacultyProfile = !!professorId;

  if (professorId) {
    const cycles = await getRelevantFacultyCycles(getPrisma(), user, now);
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

    if (access.evaluation) {
      const evaluation = await db.query<EvaluationRow>(`
        SELECT h.level_name AS "hiringLevel", h.evaluation_interval_years AS "intervalYears", p.hire_date AS "hireDate",
          ARRAY(SELECT DISTINCT ts.term_code FROM public.teaches t JOIN public.course_section cs ON cs.section_id = t.section_id
            JOIN public.semester ts ON ts.semester_id = cs.semester_id WHERE t.professor_id = p.professor_id) AS "teachingTerms",
          last_evaluation.*
        FROM public.professor p JOIN public.hiring_level h ON h.hiring_level_id = p.hiring_level_id
        LEFT JOIN LATERAL (
          SELECT o.observation_id AS "observationId",
            COALESCE(a.completed_at, o.completed_at, GREATEST(a.observer_signed_at, a.observee_signed_at)) AS "completedAt",
            s.semester_id AS "semesterId", s.term_name AS semester, s.term_code AS "termCode"
          FROM public.evaluation_signup es JOIN public.observation o ON o.signup_id = es.signup_id
          JOIN public.signed_assessment a ON a.observation_id = o.observation_id
          JOIN public.evaluation_cycle c ON c.cycle_id = o.cycle_id
          JOIN public.semester s ON s.semester_id = c.semester_id
          WHERE es.professor_id = p.professor_id AND a.is_locked = true
            AND a.observer_signed_at IS NOT NULL AND a.observee_signed_at IS NOT NULL
          ORDER BY "completedAt" DESC, o.observation_id ASC LIMIT 1
        ) last_evaluation ON true
        WHERE p.professor_id = $1 AND p.user_id = $2`, [professorId, user.id]);
      const row = evaluation.rows[0];
      if (row) {
        result.evaluation = { ...facultyEligibility(cycle, row.termCode, row.intervalYears, row.hireDate, row.teachingTerms ?? []), hiringLevel: row.hiringLevel,
          lastCompletedEvaluation: row.observationId && row.completedAt && row.semesterId && row.semester
            ? { observationId: row.observationId, completedAt: row.completedAt.toISOString(), semesterId: row.semesterId, semester: row.semester } : null };
      }
      if (!cycle) result.evaluation.reason = result.cycleReason!;
    }

    if (cycle && access.observations) {
      const observations = await db.query<ObservationRow>(`
          SELECT o.observation_id AS id, o.status,
            CASE WHEN es.professor_id = $1 THEN 'observee' ELSE 'observer' END AS participation,
            co.course_code AS course, cs.section_code AS section, o.scheduled_at AS "scheduledAt"
          FROM public.observation o JOIN public.evaluation_signup es ON es.signup_id = o.signup_id
          JOIN public.course_section cs ON cs.section_id = es.section_id
          JOIN public.course co ON co.course_id = cs.course_id
          WHERE o.cycle_id = $2 AND (es.professor_id = $1 OR o.observer_id = $1)
            AND upper(o.status) NOT IN ('COMPLETED', 'CANCELLED', 'CANCELED', 'NOT_OCCURRED') AND o.completed_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM public.signed_assessment a WHERE a.observation_id = o.observation_id
              AND a.is_locked = true AND a.observer_signed_at IS NOT NULL AND a.observee_signed_at IS NOT NULL)
          ORDER BY CASE WHEN es.professor_id = $1 THEN 0 ELSE 1 END,
            o.scheduled_at ASC NULLS LAST, es.signup_date DESC, o.observation_id ASC`, [professorId, cycle.id]);
      const pending = await db.query<{ count: number }>(`
          SELECT count(*)::int AS count FROM public.observation_candidate candidate
          JOIN public.observation o ON o.observation_id = candidate.observation_id
          JOIN public.evaluation_signup es ON es.signup_id = o.signup_id
          JOIN public.evaluation_cycle c ON c.cycle_id = o.cycle_id
          WHERE candidate.professor_id = $1 AND o.cycle_id = $2 AND es.professor_id <> $1
            AND upper(candidate.status) = 'PENDING' AND candidate.invited_at <= $3
            AND candidate.responded_at IS NULL AND candidate.expires_at > $3
            AND c.observation_deadline > $3 AND o.observer_id IS NULL AND o.completed_at IS NULL
            AND upper(o.status) NOT IN ('COMPLETED', 'CANCELLED', 'CANCELED', 'NOT_OCCURRED')
            AND NOT EXISTS (SELECT 1 FROM public.signed_assessment a WHERE a.observation_id = o.observation_id
              AND a.is_locked = true AND a.observer_signed_at IS NOT NULL AND a.observee_signed_at IS NOT NULL)`, [professorId, cycle.id, now]);
      result.availableObservations = observations.rows.map(record => ({ id: record.id, label: `${record.course}.${record.section} · ${record.participation}` }));
      const selectedId = options.observationId === undefined ? await selectedFacultyObservation() : options.observationId;
      const observation = observations.rows.find(record => record.id === selectedId) ?? observations.rows[0];
      if (observation) result.currentObservation = { ...observation, scheduledAt: observation.scheduledAt?.toISOString() ?? null };
      result.pendingObserverRequestCount = pending.rows[0]?.count ?? 0;
    }
  }

  if (access.activity) {
    const activity = await db.query<ActivityRow>(`
      SELECT notification_id AS id, title, message, created_at AS "createdAt"
      FROM public.notification WHERE user_id = $1
      ORDER BY created_at DESC, notification_id ASC LIMIT 5`, [user.id]);
    result.recentActivity = activity.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }
  return result;
}
