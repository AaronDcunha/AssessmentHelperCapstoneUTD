import "server-only";
import { randomUUID } from "node:crypto";
import type { AccountUser } from "../account-auth";
import { getPool } from "../db";
import { getFacultyWorkflow } from "../queries/faculty-workflow";
import { meetingOccurrence } from "./faculty-meetings";

import { FacultyActionError } from "./faculty-errors";
export { FacultyActionError } from "./faculty-errors";
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;

export function signupInput(body: unknown): { sectionId: string; dates: string[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new FacultyActionError("Choose a course section and proposed dates.", 400);
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some(key => !["sectionId", "dates"].includes(key)) || typeof record.sectionId !== "string" || !uuid.test(record.sectionId)
    || !Array.isArray(record.dates) || !record.dates.length || record.dates.length > 366
    || record.dates.some(date => typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    || new Set(record.dates).size !== record.dates.length) throw new FacultyActionError("Choose one course section and unique scheduled dates.", 400);
  return { sectionId: record.sectionId, dates: record.dates as string[] };
}

export async function submitFacultySignup(user: AccountUser, body: unknown) {
  if (!["profile.read.own", "course-sections.read.own", "signups.read.own", "signups.create.own", "evaluation-status.read.own", "observations.read.own"].every(permission => user.permissions.includes(permission))) throw new FacultyActionError("Forbidden", 403);
  const input = signupInput(body);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const profile = await client.query<{ id: string }>("SELECT professor_id AS id FROM public.professor WHERE user_id = $1 FOR UPDATE", [user.id]);
    if (!profile.rows[0]) throw new FacultyActionError("A faculty profile is required.");
    // Serialize against cycle deadline edits and another signup by this faculty member.
    await client.query(`SELECT c.cycle_id FROM public.evaluation_cycle c JOIN public.course_section cs ON cs.semester_id = c.semester_id
      WHERE cs.section_id = $1 FOR UPDATE OF c`, [input.sectionId]);
    const now = new Date();
    const workspace = await getFacultyWorkflow(user, { database: client, now });
    if (!workspace.signup.allowed || !workspace.dashboard.cycle) throw new FacultyActionError(workspace.signup.reason);
    const section = workspace.sections.find(section => section.id === input.sectionId);
    if (!section) throw new FacultyActionError("That section is not assigned to you in the current cycle.", 400);
    // Protect ownership and the schedule used for validation until commit.
    await client.query("SELECT section_id FROM public.course_section WHERE section_id = $1 FOR SHARE", [section.id]);
    await client.query("SELECT semester_id FROM public.semester WHERE semester_id = $1 FOR SHARE", [workspace.dashboard.cycle.semesterId]);
    const assignment = await client.query("SELECT t.section_id FROM public.teaches t JOIN public.professor p ON p.professor_id = t.professor_id WHERE p.user_id = $1 AND t.section_id = $2 FOR SHARE OF t", [user.id, section.id]);
    if (!assignment.rowCount) throw new FacultyActionError("The course assignment changed. Reload and try again.");
    await client.query("SELECT meeting_id FROM public.class_meeting WHERE section_id = $1 FOR SHARE", [section.id]);
    const refreshed = await getFacultyWorkflow(user, { database: client, now: new Date() });
    const current = refreshed.sections.find(item => item.id === section.id);
    if (!refreshed.signup.allowed) throw new FacultyActionError(refreshed.signup.reason);
    if (refreshed.dashboard.cycle?.id !== workspace.dashboard.cycle.id) throw new FacultyActionError("The relevant evaluation cycle changed. Reload before submitting.");
    if (!current || input.dates.some(date => !current.options.some(option => option.date === date))) throw new FacultyActionError("One or more dates are no longer available. Reload the section schedule.", 400);
    const signupId = randomUUID(), observationId = randomUUID();
    await client.query(`INSERT INTO public.evaluation_signup (signup_id, cycle_id, professor_id, section_id, signup_date)
      VALUES ($1, $2, $3, $4, $5)`, [signupId, workspace.dashboard.cycle.id, profile.rows[0].id, section.id, new Date()]);
    await client.query(`INSERT INTO public.observation (observation_id, signup_id, cycle_id, status) VALUES ($1, $2, $3, 'PENDING')`, [observationId, signupId, workspace.dashboard.cycle.id]);
    for (const date of input.dates) {
      const occurrence = meetingOccurrence(date, current.meetings, refreshed.dashboard.cycle!.timeZone);
      if (!occurrence) throw new FacultyActionError("The proposed meeting cannot be resolved in its configured time zone.");
      await client.query(`INSERT INTO public.observation_time_option (time_option_id, observation_id, preferred_date, starts_at, ends_at, time_zone, location) VALUES ($1, $2, $3::date, $4, $5, $6, $7)`, [randomUUID(), observationId, date, occurrence.startsAt, occurrence.endsAt, occurrence.timeZone, occurrence.location]);
    }
    await client.query("COMMIT");
    return { signupId, observationId, message: "Your signup and proposed dates have been saved. Observer recommendations are not yet released." };
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") throw new FacultyActionError("You have already signed up for this cycle.");
    throw error;
  } finally { client.release(); }
}

export async function declineFacultyRequest(user: AccountUser, body: unknown) {
  if (!["profile.read.own", "observations.read.own", "invitations.respond.own"].every(permission => user.permissions.includes(permission))) throw new FacultyActionError("Forbidden", 403);
  const input = body as Record<string, unknown> | null;
  if (!input || typeof input.candidateId !== "string" || !uuid.test(input.candidateId) || Object.keys(input).length !== 1) throw new FacultyActionError("Choose a valid invitation.", 400);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT o.observation_id FROM public.observation_candidate candidate
      JOIN public.professor p ON p.professor_id = candidate.professor_id JOIN public.observation o ON o.observation_id = candidate.observation_id
      WHERE candidate.candidate_id = $1 AND p.user_id = $2 FOR UPDATE OF o, candidate`, [input.candidateId, user.id]);
    const workspace = await getFacultyWorkflow(user, { database: client });
    if (!workspace.requests.some(request => request.id === input.candidateId)) throw new FacultyActionError("The invitation is no longer available.");
    const changed = await client.query<{ recipient: string }>(`
      UPDATE public.observation_candidate candidate SET status = 'DECLINED', responded_at = clock_timestamp()
      FROM public.professor recipient, public.observation o, public.evaluation_signup es, public.professor observee, public.evaluation_cycle c
      WHERE candidate.candidate_id = $1 AND recipient.professor_id = candidate.professor_id AND recipient.user_id = $2
        AND o.observation_id = candidate.observation_id AND es.signup_id = o.signup_id AND observee.professor_id = es.professor_id
        AND c.cycle_id = o.cycle_id AND o.cycle_id = $3 AND es.professor_id <> candidate.professor_id
        AND upper(candidate.status) = 'PENDING' AND candidate.invited_at <= clock_timestamp() AND candidate.expires_at > clock_timestamp()
        AND candidate.responded_at IS NULL AND o.observer_id IS NULL AND o.completed_at IS NULL AND c.observation_deadline > clock_timestamp()
        AND upper(o.status) NOT IN ('COMPLETED', 'CANCELLED', 'CANCELED')
        AND NOT EXISTS (SELECT 1 FROM public.signed_assessment a WHERE a.observation_id = o.observation_id
          AND a.is_locked AND a.observer_signed_at IS NOT NULL AND a.observee_signed_at IS NOT NULL)
      RETURNING observee.user_id AS recipient`, [input.candidateId, user.id, workspace.dashboard.cycle?.id]);
    if (!changed.rows[0]) throw new FacultyActionError("The invitation changed or expired. Reload to see its current status.");
    await client.query(`INSERT INTO public.notification (notification_id, user_id, title, message, notification_type)
      VALUES ($1, $2, 'Observer request declined', 'An invited observer declined your observation request.', 'INVITATION_DECLINED')`, [randomUUID(), changed.rows[0].recipient]);
    await client.query("COMMIT");
    return { message: "The invitation was declined." };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
