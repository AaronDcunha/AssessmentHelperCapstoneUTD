import "server-only";
import type { QueryResultRow } from "pg";
import type { AccountUser } from "../account-auth";
import { getPool } from "../db";
import { getFacultyDashboard, type FacultyDashboard } from "./faculty-dashboard";
import { facultyDate, meetingForDate, proposedMeetingOptions, type WeeklyMeeting, type MeetingOption } from "../services/faculty-calendar";

type Database = { query<Row extends QueryResultRow>(sql: string, values: unknown[]): Promise<{ rows: Row[] }> };
export type FacultySection = { id: string; label: string; meetings: WeeklyMeeting[]; options: MeetingOption[] };
export type FacultyObservation = {
  id: string; course: string; section: string; observee: string; observer: string | null;
  status: string; scheduledAt: string | null; participation: "observee" | "observer";
  meetings: WeeklyMeeting[]; proposedDates: MeetingOption[];
};
export type FacultyRequest = { id: string; observee: string; course: string; section: string; expiresAt: string; options: MeetingOption[] };
export type FacultyWorkflow = {
  dashboard: FacultyDashboard;
  sections: FacultySection[];
  existingSignup: { id: string; sectionId: string; signedUpAt: string } | null;
  signup: { allowed: boolean; reason: string; observationDeadline: string | null };
  observation: FacultyObservation | null;
  requests: FacultyRequest[];
};

export function signupBlockReason(user: AccountUser, dashboard: FacultyDashboard, existingSignup: boolean): string {
  if (!["signups.create.own", "signups.read.own", "course-sections.read.own", "evaluation-status.read.own", "observations.read.own"].every(permission => user.permissions.includes(permission))) return "Signup is not available with your current permissions.";
  if (!dashboard.hasFacultyProfile || !dashboard.cycle) return "No active faculty evaluation cycle is available.";
  if (new Date(dashboard.cycle.signupDeadline) <= new Date(dashboard.asOf)) return "The signup deadline has passed.";
  if (existingSignup) return "You have already signed up for this cycle.";
  // A prior-semester completed evaluation verifies this is not the first semester.
  // Missing-history/hire-date eligibility has not been agreed; never assume permission to enroll.
  if (dashboard.evaluation.status === "unknown" || !dashboard.evaluation.lastCompletedEvaluation
    || dashboard.evaluation.lastCompletedEvaluation.semesterId === dashboard.cycle.semesterId) return "Signup eligibility needs review before you can submit. No verified evaluation in a prior semester is available.";
  return "";
}

export async function getFacultyWorkflow(user: AccountUser, options: { now?: Date; database?: Database } = {}): Promise<FacultyWorkflow> {
  const now = options.now ?? new Date();
  const dashboard = await getFacultyDashboard(user, { ...options, now });
  const result: FacultyWorkflow = { dashboard, sections: [], existingSignup: null,
    signup: { allowed: false, reason: "No active faculty evaluation cycle is available.", observationDeadline: dashboard.cycle ? facultyDate(new Date(dashboard.cycle.observationDeadline)) : null }, observation: null, requests: [] };
  const cycle = dashboard.cycle;
  if (!dashboard.hasFacultyProfile || !cycle) return result;
  const db = options.database ?? getPool();
  if (user.permissions.includes("course-sections.read.own")) {
    const sections = await db.query<{ id: string; label: string; meetings: WeeklyMeeting[] }>(`
      SELECT cs.section_id AS id, co.course_code || '.' || cs.section_code || ' · ' || co.course_title AS label,
        COALESCE((SELECT json_agg(json_build_object('id', cm.meeting_id, 'day', cm.day_of_week,
          'startTime', cm.start_time, 'endTime', cm.end_time, 'location', cm.location) ORDER BY cm.day_of_week, cm.start_time, cm.meeting_id)
          FROM public.class_meeting cm WHERE cm.section_id = cs.section_id), '[]'::json) AS meetings
      FROM public.teaches t JOIN public.professor p ON p.professor_id = t.professor_id
      JOIN public.course_section cs ON cs.section_id = t.section_id JOIN public.course co ON co.course_id = cs.course_id
      WHERE p.user_id = $1 AND cs.semester_id = $2 ORDER BY co.course_code, cs.section_code, cs.section_id`, [user.id, cycle.semesterId]);
    result.sections = sections.rows.map(section => ({ ...section, options: proposedMeetingOptions(section.meetings, now, new Date(cycle.observationDeadline)) }));
  }
  if (user.permissions.includes("signups.read.own")) {
    const signups = await db.query<{ id: string; sectionId: string; signedUpAt: Date }>(`
      SELECT es.signup_id AS id, es.section_id AS "sectionId", es.signup_date AS "signedUpAt"
      FROM public.evaluation_signup es JOIN public.professor p ON p.professor_id = es.professor_id
      WHERE p.user_id = $1 AND es.cycle_id = $2`, [user.id, cycle.id]);
    const signup = signups.rows[0];
    if (signup) result.existingSignup = { ...signup, signedUpAt: signup.signedUpAt.toISOString() };
  }
  const reason = signupBlockReason(user, dashboard, !!result.existingSignup);
  result.signup.allowed = !reason && result.sections.some(section => section.options.length);
  result.signup.reason = reason || (result.signup.allowed ? "" : "No unambiguous scheduled class dates are available before the observation deadline.");
  if (dashboard.currentObservation) {
    const observations = await db.query<Omit<FacultyObservation, "scheduledAt" | "proposedDates"> & { scheduledAt: Date | null; dates: string[] }>(`
      SELECT o.observation_id AS id, co.course_code AS course, cs.section_code AS section,
        observee.full_name AS observee, observer.full_name AS observer, o.status, o.scheduled_at AS "scheduledAt",
        CASE WHEN p.user_id = $1 THEN 'observee' ELSE 'observer' END AS participation,
        COALESCE((SELECT json_agg(json_build_object('id', cm.meeting_id, 'day', cm.day_of_week, 'startTime', cm.start_time,
          'endTime', cm.end_time, 'location', cm.location)) FROM public.class_meeting cm WHERE cm.section_id = cs.section_id), '[]'::json) AS meetings,
        ARRAY(SELECT preferred_date::text FROM public.observation_time_option WHERE observation_id = o.observation_id ORDER BY preferred_date) AS dates
      FROM public.observation o JOIN public.evaluation_signup es ON es.signup_id = o.signup_id
      JOIN public.professor p ON p.professor_id = es.professor_id JOIN public.app_user observee ON observee.user_id = p.user_id
      LEFT JOIN public.professor selected ON selected.professor_id = o.observer_id LEFT JOIN public.app_user observer ON observer.user_id = selected.user_id
      JOIN public.course_section cs ON cs.section_id = es.section_id JOIN public.course co ON co.course_id = cs.course_id
      WHERE o.observation_id = $2 AND o.cycle_id = $3 AND (p.user_id = $1 OR selected.user_id = $1)`, [user.id, dashboard.currentObservation.id, cycle.id]);
    const observation = observations.rows[0];
    if (observation) {
      const { dates, ...record } = observation;
      result.observation = { ...record, scheduledAt: record.scheduledAt?.toISOString() ?? null,
        proposedDates: dates.flatMap(date => { const option = meetingForDate(date, record.meetings); return option ? [option] : []; }) };
    }
  }
  if (dashboard.access.observations) {
    const requests = await db.query<{ id: string; observee: string; course: string; section: string; expiresAt: Date; dates: string[]; meetings: WeeklyMeeting[] }>(`
      SELECT candidate.candidate_id AS id, u.full_name AS observee, co.course_code AS course, cs.section_code AS section, candidate.expires_at AS "expiresAt",
        ARRAY(SELECT preferred_date::text FROM public.observation_time_option WHERE observation_id = o.observation_id ORDER BY preferred_date) AS dates,
        COALESCE((SELECT json_agg(json_build_object('id', cm.meeting_id, 'day', cm.day_of_week, 'startTime', cm.start_time,
          'endTime', cm.end_time, 'location', cm.location)) FROM public.class_meeting cm WHERE cm.section_id = cs.section_id), '[]'::json) AS meetings
      FROM public.observation_candidate candidate JOIN public.professor recipient ON recipient.professor_id = candidate.professor_id
      JOIN public.observation o ON o.observation_id = candidate.observation_id JOIN public.evaluation_signup es ON es.signup_id = o.signup_id
      JOIN public.professor observee ON observee.professor_id = es.professor_id JOIN public.app_user u ON u.user_id = observee.user_id
      JOIN public.course_section cs ON cs.section_id = es.section_id JOIN public.course co ON co.course_id = cs.course_id
      JOIN public.evaluation_cycle c ON c.cycle_id = o.cycle_id
      WHERE recipient.user_id = $1 AND o.cycle_id = $2 AND es.professor_id <> candidate.professor_id
        AND upper(candidate.status) = 'PENDING' AND candidate.invited_at <= $3 AND candidate.responded_at IS NULL AND candidate.expires_at > $3
        AND c.observation_deadline > $3 AND o.observer_id IS NULL AND o.completed_at IS NULL
        AND upper(o.status) NOT IN ('COMPLETED', 'CANCELLED', 'CANCELED')
        AND NOT EXISTS (SELECT 1 FROM public.signed_assessment a WHERE a.observation_id = o.observation_id
          AND a.is_locked AND a.observer_signed_at IS NOT NULL AND a.observee_signed_at IS NOT NULL)
      ORDER BY candidate.expires_at, candidate.candidate_id`, [user.id, cycle.id, now]);
    result.requests = requests.rows.map(({ dates, meetings, ...request }) => ({ ...request, expiresAt: request.expiresAt.toISOString(),
      options: dates.flatMap(date => { const option = meetingForDate(date, meetings); return option ? [option] : []; }) }));
  }
  return result;
}
