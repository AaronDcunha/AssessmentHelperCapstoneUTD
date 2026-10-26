import "server-only";
import type { QueryResultRow } from "pg";
import type { AccountUser } from "../account-auth";
import { getPool } from "../db";
import { facultyEvaluationStatus, type EvaluationStatus } from "../services/faculty-evaluation";

type Database = { query<Row extends QueryResultRow>(sql: string, values: unknown[]): Promise<{ rows: Row[] }> };
type CycleRow = { id: string; name: string; semesterId: string; semester: string; termCode: string; signupDeadline: Date; observationDeadline: Date; feedbackDeadline: Date };
type EvaluationRow = { hiringLevel: string; intervalYears: number; observationId: string | null; completedAt: Date | null; semesterId: string | null; semester: string | null; termCode: string | null };
type ObservationRow = { id: string; status: string; participation: "observee" | "observer"; course: string; section: string; scheduledAt: Date | null };
type ActivityRow = { id: string; title: string; message: string; createdAt: Date };

export type FacultyDashboard = {
  asOf: string;
  hasFacultyProfile: boolean;
  cycle: (Omit<CycleRow, "signupDeadline" | "observationDeadline" | "feedbackDeadline"> & { signupDeadline: string; observationDeadline: string; feedbackDeadline: string }) | null;
  evaluation: { status: EvaluationStatus; reason: string; hiringLevel: string | null; lastCompletedEvaluation: { observationId: string; completedAt: string; semesterId: string; semester: string } | null };
  currentObservation: (Omit<ObservationRow, "scheduledAt"> & { scheduledAt: string | null }) | null;
  pendingObserverRequestCount: number | null;
  recentActivity: { id: string; title: string; message: string; createdAt: string }[];
  access: { evaluation: boolean; observations: boolean; activity: boolean };
};

export class DashboardForbidden extends Error {}

/** Only call with the identity freshly resolved by existing Auth.js server helpers. */
export async function getFacultyDashboard(user: AccountUser, options: { now?: Date; database?: Database } = {}): Promise<FacultyDashboard> {
  if (!user.permissions.includes("profile.read.own")) throw new DashboardForbidden("Forbidden");
  const now = options.now ?? new Date();
  const access = {
    evaluation: user.permissions.includes("evaluation-status.read.own"),
    observations: user.permissions.includes("observations.read.own"),
    activity: user.permissions.includes("notifications.read.own"),
  };
  const result: FacultyDashboard = {
    asOf: now.toISOString(), hasFacultyProfile: false, cycle: null,
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
    const cycles = await db.query<CycleRow>(`
      SELECT c.cycle_id AS id, c.cycle_name AS name, s.semester_id AS "semesterId",
        s.term_name AS semester, s.term_code AS "termCode", c.signup_deadline AS "signupDeadline",
        c.observation_deadline AS "observationDeadline", c.feedback_deadline AS "feedbackDeadline"
      FROM public.evaluation_cycle c JOIN public.semester s ON s.semester_id = c.semester_id
      WHERE c.feedback_deadline >= $1 AND c.signup_deadline <= c.observation_deadline
        AND c.observation_deadline <= c.feedback_deadline
      ORDER BY c.observation_deadline ASC, c.signup_deadline DESC, c.cycle_id ASC LIMIT 1`, [now]);
    const cycle = cycles.rows[0];
    if (cycle) result.cycle = { ...cycle, signupDeadline: cycle.signupDeadline.toISOString(), observationDeadline: cycle.observationDeadline.toISOString(), feedbackDeadline: cycle.feedbackDeadline.toISOString() };

    if (access.evaluation) {
      const evaluation = await db.query<EvaluationRow>(`
        SELECT h.level_name AS "hiringLevel", h.evaluation_interval_years AS "intervalYears",
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
        result.evaluation = { ...facultyEvaluationStatus(cycle?.termCode ?? null, row.termCode, row.intervalYears), hiringLevel: row.hiringLevel,
          lastCompletedEvaluation: row.observationId && row.completedAt && row.semesterId && row.semester
            ? { observationId: row.observationId, completedAt: row.completedAt.toISOString(), semesterId: row.semesterId, semester: row.semester } : null };
      }
    }

    if (cycle && access.observations) {
      const [observations, pending] = await Promise.all([
        db.query<ObservationRow>(`
          SELECT o.observation_id AS id, o.status,
            CASE WHEN es.professor_id = $1 THEN 'observee' ELSE 'observer' END AS participation,
            co.course_code AS course, cs.section_code AS section, o.scheduled_at AS "scheduledAt"
          FROM public.observation o JOIN public.evaluation_signup es ON es.signup_id = o.signup_id
          JOIN public.course_section cs ON cs.section_id = es.section_id
          JOIN public.course co ON co.course_id = cs.course_id
          WHERE o.cycle_id = $2 AND (es.professor_id = $1 OR o.observer_id = $1)
            AND upper(o.status) NOT IN ('COMPLETED', 'CANCELLED', 'CANCELED') AND o.completed_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM public.signed_assessment a WHERE a.observation_id = o.observation_id
              AND a.is_locked = true AND a.observer_signed_at IS NOT NULL AND a.observee_signed_at IS NOT NULL)
          ORDER BY CASE WHEN es.professor_id = $1 THEN 0 ELSE 1 END,
            o.scheduled_at ASC NULLS LAST, es.signup_date DESC, o.observation_id ASC LIMIT 1`, [professorId, cycle.id]),
        db.query<{ count: number }>(`
          SELECT count(*)::int AS count FROM public.observation_candidate candidate
          JOIN public.observation o ON o.observation_id = candidate.observation_id
          JOIN public.evaluation_signup es ON es.signup_id = o.signup_id
          JOIN public.evaluation_cycle c ON c.cycle_id = o.cycle_id
          WHERE candidate.professor_id = $1 AND o.cycle_id = $2 AND es.professor_id <> $1
            AND upper(candidate.status) = 'PENDING' AND candidate.invited_at <= $3
            AND candidate.responded_at IS NULL AND candidate.expires_at > $3
            AND c.observation_deadline > $3 AND o.observer_id IS NULL AND o.completed_at IS NULL
            AND upper(o.status) NOT IN ('COMPLETED', 'CANCELLED', 'CANCELED')
            AND NOT EXISTS (SELECT 1 FROM public.signed_assessment a WHERE a.observation_id = o.observation_id
              AND a.is_locked = true AND a.observer_signed_at IS NOT NULL AND a.observee_signed_at IS NOT NULL)`, [professorId, cycle.id, now]),
      ]);
      const observation = observations.rows[0];
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
