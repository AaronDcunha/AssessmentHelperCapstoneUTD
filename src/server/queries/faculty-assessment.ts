import "server-only";
import { createHash } from "node:crypto";
import type { QueryResultRow } from "pg";
import type { AccountUser } from "../account-auth";
import { getPool } from "../db";
import { getFacultyDashboard } from "./faculty-dashboard";

type Database = { query<Row extends QueryResultRow>(sql: string, values: unknown[]): Promise<{ rows: Row[] }> };
export type Criterion = { id: string; prompt: string; type: string; min: number | null; max: number | null; required: boolean };
export type AssessmentAnswers = { answers: Record<string, string | number>; comments: string };
export type FacultyAssessment = {
  observationId: string; templateId: string; title: string; description: string | null;
  course: string; section: string; scheduledAt: string | null;
  participation: "observer" | "observee"; observer: string; observee: string;
  criteria: Criterion[]; responses: AssessmentAnswers; revision: string;
  observerSignedAt: string | null; observeeSignedAt: string | null; locked: boolean;
  canEdit: boolean; canAcknowledge: boolean;
};
export type AssessmentRow = {
  observationId: string; templateId: string; title: string; description: string | null; course: string; section: string;
  scheduledAt: Date | null; participation: "observer" | "observee"; observer: string; observee: string;
  criteria: Criterion[]; responses: AssessmentAnswers | null; observerSignedAt: Date | null; observeeSignedAt: Date | null; locked: boolean;
};

export function assessmentView(row: AssessmentRow, user: AccountUser): FacultyAssessment {
  const responses = row.responses ?? { answers: {}, comments: "" };
  if (!responses.answers || typeof responses.answers !== "object" || Array.isArray(responses.answers)
    || typeof responses.comments !== "string" || Object.values(responses.answers).some(value => typeof value !== "number" && typeof value !== "string")) {
    // Preserve unrecognized existing JSON rather than overwriting it with an empty draft.
    throw new Error("The stored assessment answer format requires review.");
  }
  const observerSignedAt = row.observerSignedAt?.toISOString() ?? null, observeeSignedAt = row.observeeSignedAt?.toISOString() ?? null;
  const revision = createHash("sha256").update(JSON.stringify([row.observationId, row.templateId, row.criteria, responses, observerSignedAt, observeeSignedAt, row.locked])).digest("hex");
  return { ...row, responses, scheduledAt: row.scheduledAt?.toISOString() ?? null, observerSignedAt, observeeSignedAt, revision,
    canEdit: row.participation === "observer" && !row.locked && !observerSignedAt && !observeeSignedAt && user.permissions.includes("assessment.submit.own"),
    canAcknowledge: !row.locked && (row.participation === "observer" ? !observerSignedAt && user.permissions.includes("assessment.submit.own")
      : !!observerSignedAt && !observeeSignedAt && user.permissions.includes("assessment.acknowledge.own")) };
}

export async function getFacultyAssessment(user: AccountUser, options: { database?: Database } = {}): Promise<FacultyAssessment | null> {
  if (!user.permissions.includes("assessment.read.own")) return null;
  const db = options.database ?? getPool();
  const dashboard = await getFacultyDashboard(user, options);
  if (!dashboard.currentObservation?.scheduledAt) return null;
  const rows = await db.query<AssessmentRow>(`
    SELECT o.observation_id AS "observationId", t.template_id AS "templateId", t.template_name AS title, t.description,
      co.course_code AS course, cs.section_code AS section, o.scheduled_at AS "scheduledAt", observer.full_name AS observer, observee.full_name AS observee,
      CASE WHEN selected.user_id = $1 THEN 'observer' ELSE 'observee' END AS participation,
      COALESCE(a.is_locked, false) AS locked, a.responses, a.observer_signed_at AS "observerSignedAt", a.observee_signed_at AS "observeeSignedAt",
      COALESCE((SELECT json_agg(json_build_object('id', tc.criterion_id, 'prompt', tc.criterion_text, 'type', tc.question_type,
        'min', tc.min_rating, 'max', tc.max_rating, 'required', tc.is_required) ORDER BY tc.display_order, tc.criterion_id)
        FROM public.template_criterion tc WHERE tc.template_id = t.template_id), '[]'::json) AS criteria
    FROM public.observation o JOIN public.evaluation_signup es ON es.signup_id = o.signup_id
    JOIN public.professor p ON p.professor_id = es.professor_id JOIN public.app_user observee ON observee.user_id = p.user_id
    JOIN public.professor selected ON selected.professor_id = o.observer_id JOIN public.app_user observer ON observer.user_id = selected.user_id
    JOIN public.course_section cs ON cs.section_id = es.section_id JOIN public.course co ON co.course_id = cs.course_id
    LEFT JOIN public.signed_assessment a ON a.observation_id = o.observation_id
    JOIN public.observation_template t ON t.template_id = COALESCE(a.template_id,
      (SELECT template_id FROM public.observation_template WHERE is_active ORDER BY created_at DESC, template_id LIMIT 1))
    WHERE o.observation_id = $2 AND (p.user_id = $1 OR selected.user_id = $1) AND o.scheduled_at <= $3`, [user.id, dashboard.currentObservation.id, new Date()]);
  return rows.rows[0] ? assessmentView(rows.rows[0], user) : null;
}
