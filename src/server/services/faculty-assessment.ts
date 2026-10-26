import "server-only";
import { randomUUID } from "node:crypto";
import type { AccountUser } from "../account-auth";
import { getPool } from "../db";
import { getFacultyAssessment, assessmentView, type AssessmentRow, type AssessmentAnswers, type Criterion, type CommentPrompt } from "../queries/faculty-assessment";
import { FacultyActionError } from "./faculty-actions";

export function validateAssessmentAnswers(criteria: readonly Criterion[], value: unknown, complete: boolean, prompts: readonly CommentPrompt[] = []): AssessmentAnswers {
  if (!criteria.length || criteria.some(c => !["RATING", "TEXT"].includes(c.type)
    || (c.type === "RATING" && (!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 20
      || c.options.some(option => !option || !Number.isInteger(option.value) || typeof option.label !== "string" || !option.label.trim())
      || new Set(c.options.map(option => option.value)).size !== c.options.length)))) throw new FacultyActionError("This template needs review before the form can be saved.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FacultyActionError("Invalid form answers.", 400);
  const data = value as { answers?: unknown; comments?: unknown; promptAnswers?: unknown };
  if (Object.keys(data).some(key => !["answers", "comments", "promptAnswers"].includes(key))) throw new FacultyActionError("Invalid form answers.", 400);
  if (!data.answers || typeof data.answers !== "object" || Array.isArray(data.answers) || typeof data.comments !== "string" || data.comments.length > 20000) throw new FacultyActionError("Invalid form answers or comments.", 400);
  const answers = data.answers as Record<string, unknown>;
  if (Object.keys(answers).some(id => !criteria.some(c => c.id === id))) throw new FacultyActionError("The template changed. Reload the form.");
  for (const criterion of criteria) {
    const answer = answers[criterion.id];
    if (answer === undefined || answer === "") {
      if (complete && criterion.required) throw new FacultyActionError("Complete every required question before acknowledging.", 400);
    } else if (criterion.type === "RATING" ? typeof answer !== "number" || !criterion.options!.some(option => option.value === answer)
      : typeof answer !== "string" || answer.length > 20000 || (complete && criterion.required && !answer.trim())) throw new FacultyActionError("An answer is outside the template's allowed values.", 400);
  }
  const promptAnswers = data.promptAnswers === undefined ? {} : data.promptAnswers;
  if (!promptAnswers || typeof promptAnswers !== "object" || Array.isArray(promptAnswers)
    || Object.entries(promptAnswers).some(([id, value]) => !prompts.some(prompt => prompt.id === id) || typeof value !== "string" || value.length > 20000)) throw new FacultyActionError("Invalid template comments.", 400);
  const stored = promptAnswers as Record<string, string>;
  if (complete && prompts.some(prompt => prompt.required && !stored[prompt.id]?.trim())) throw new FacultyActionError("Complete every required comment before acknowledging.", 400);
  return { answers: answers as Record<string, string | number>, comments: data.comments, ...(data.promptAnswers !== undefined || prompts.length ? { promptAnswers: stored } : {}) };
}

export async function saveFacultyAssessment(user: AccountUser, body: unknown) {
  if (!["profile.read.own", "observations.read.own", "assessment.read.own"].every(permission => user.permissions.includes(permission))) throw new FacultyActionError("Forbidden", 403);
  const input = body as { action?: unknown; revision?: unknown; responses?: unknown; acknowledged?: unknown } | null;
  if (!input || !["save", "acknowledge"].includes(String(input.action)) || typeof input.revision !== "string"
    || Object.keys(input).some(key => !["action", "revision", "responses", "acknowledged"].includes(key))) throw new FacultyActionError("Invalid form request.", 400);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    let form = await getFacultyAssessment(user, { database: client });
    if (!form) throw new FacultyActionError("A scheduled observation, assigned observer and available template are required.");
    // Every save/acknowledgement serializes through its parent observation, including first saves.
    await client.query(`SELECT o.observation_id FROM public.observation o JOIN public.evaluation_signup es ON es.signup_id = o.signup_id
      JOIN public.professor observee ON observee.professor_id = es.professor_id JOIN public.professor observer ON observer.professor_id = o.observer_id
      WHERE o.observation_id = $1 AND (observee.user_id = $2 OR observer.user_id = $2) FOR UPDATE OF o`, [form.observationId, user.id]);
    await client.query("SELECT template_id FROM public.observation_template WHERE template_id = $1 FOR SHARE", [form.templateId]);
    await client.query("SELECT criterion_id FROM public.template_criterion WHERE template_id = $1 FOR SHARE", [form.templateId]);
    form = await getFacultyAssessment(user, { database: client });
    if (!form || input.revision !== form.revision) throw new FacultyActionError("This form changed. Reload before saving or acknowledging.");
    if (form.locked || (input.action === "save" ? !form.canEdit : !form.canAcknowledge)) throw new FacultyActionError("This action is not available to you on this form.", 403);
    if (input.action === "acknowledge" && input.acknowledged !== true) throw new FacultyActionError("Confirm that the observation occurred before acknowledging.", 400);
    if (form.participation === "observee" && input.responses !== undefined) throw new FacultyActionError("Only the observer may change answers.", 403);
    const responses = form.participation === "observer" ? validateAssessmentAnswers(form.criteria, input.responses, input.action === "acknowledge", form.commentPrompts) : form.responses;
    if (input.action === "acknowledge") validateAssessmentAnswers(form.criteria, responses, true, form.commentPrompts);
    const timestamp = new Date();
    const observerSignedAt = input.action === "acknowledge" && form.participation === "observer" ? timestamp : form.observerSignedAt ? new Date(form.observerSignedAt) : null;
    const observeeSignedAt = input.action === "acknowledge" && form.participation === "observee" ? timestamp : form.observeeSignedAt ? new Date(form.observeeSignedAt) : null;
    const locked = !!observerSignedAt && !!observeeSignedAt;
    await client.query(`INSERT INTO public.signed_assessment (assessment_id, observation_id, template_id, responses, observer_signed_at, observee_signed_at, is_locked, completed_at)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
      ON CONFLICT (observation_id) DO UPDATE SET responses = EXCLUDED.responses, observer_signed_at = EXCLUDED.observer_signed_at,
        observee_signed_at = EXCLUDED.observee_signed_at, is_locked = EXCLUDED.is_locked, completed_at = EXCLUDED.completed_at
      WHERE public.signed_assessment.is_locked = false`, [randomUUID(), form.observationId, form.templateId, JSON.stringify(responses), observerSignedAt, observeeSignedAt, locked, locked ? timestamp : null]);
    if (locked) await client.query("UPDATE public.observation SET status = 'COMPLETED', completed_at = $2 WHERE observation_id = $1", [form.observationId, timestamp]);
    if (input.action === "acknowledge") await client.query(`INSERT INTO public.notification (notification_id, user_id, title, message, notification_type)
      SELECT $1, p.user_id, $3, $4, 'ASSESSMENT_UPDATED' FROM public.observation o JOIN public.evaluation_signup es ON es.signup_id = o.signup_id
      JOIN public.professor p ON p.professor_id = CASE WHEN $5 THEN o.observer_id ELSE es.professor_id END WHERE o.observation_id = $2`,
    [randomUUID(), form.observationId, locked ? "Observation completed" : "Observation ready for acknowledgement",
      locked ? "Both participants acknowledged the observation. The assessment is finalized and locked." : "The observer submitted the assessment. You may review it and acknowledge that the observation occurred.", form.participation === "observee"]);
    await client.query("COMMIT");
    const row: AssessmentRow = { ...form, responses, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt) : null, observerSignedAt, observeeSignedAt, locked };
    return { form: assessmentView(row, user), message: locked ? "Both acknowledgements are recorded. The form is finalized and locked." : input.action === "save" ? "Draft saved." : "Your acknowledgement is recorded. The other participant must acknowledge separately." };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
