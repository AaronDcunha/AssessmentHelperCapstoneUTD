import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import type { AccountUser } from "../account-auth";
import { getPrisma } from "../prisma";
import { getFacultyDashboard, type FacultyDashboard } from "./faculty-dashboard";
import { facultyDate, meetingForDate, proposedMeetingOptions, type WeeklyMeeting, type MeetingOption } from "../services/faculty-calendar";
import { getFacultyLinks, type FacultyLinks } from "./faculty-links";

type Database = Prisma.TransactionClient;
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
  links?: FacultyLinks;
};

export function signupBlockReason(user: AccountUser, dashboard: FacultyDashboard, existingSignup: boolean): string {
  if (!["signups.create.own", "signups.read.own", "course-sections.read.own", "evaluation-status.read.own", "observations.read.own"].every(permission => user.permissions.includes(permission))) return "Signup is not available with your current permissions.";
  if (!dashboard.hasFacultyProfile || !dashboard.cycle) return dashboard.cycleReason ?? "No active faculty evaluation cycle is available.";
  if (new Date(dashboard.cycle.signupDeadline) <= new Date(dashboard.asOf)) return "The signup deadline has passed.";
  if (existingSignup) return "You have already signed up for this cycle.";
  if (!dashboard.cycle.startsOn || !dashboard.cycle.endsOn) return "Semester dates must be configured before signup dates are available.";
  // A prior-semester completed evaluation verifies this is not the first semester.
  // Missing-history/hire-date eligibility has not been agreed; never assume permission to enroll.
  if (dashboard.evaluation.canSignUp === false) return dashboard.evaluation.reason;
  if (dashboard.evaluation.canSignUp === undefined && (dashboard.evaluation.status === "unknown" || !dashboard.evaluation.lastCompletedEvaluation
    || dashboard.evaluation.lastCompletedEvaluation.semesterId === dashboard.cycle.semesterId)) return "Signup eligibility needs review before you can submit. No verified evaluation in a prior semester is available.";
  return "";
}

export async function getFacultyWorkflow(user: AccountUser, options: { now?: Date; database?: Database; cycleId?: string | null } = {}): Promise<FacultyWorkflow> {
  const now = options.now ?? new Date();
  const dashboard = await getFacultyDashboard(user, { ...options, now });
  const result: FacultyWorkflow = { dashboard, sections: [], existingSignup: null,
    signup: { allowed: false, reason: dashboard.cycleReason ?? "No active faculty evaluation cycle is available.", observationDeadline: dashboard.cycle ? facultyDate(new Date(dashboard.cycle.observationDeadline), dashboard.cycle.timeZone) : null }, observation: null, requests: [] };
  const cycle = dashboard.cycle;
  if (!dashboard.hasFacultyProfile || !cycle) return result;
  const db = options.database ?? getPrisma();
  result.links = await getFacultyLinks(user, cycle.id, now, db);
  if (user.permissions.includes("course-sections.read.own")) {
    const assignments = await db.teaches.findMany({ where: { professor: { userId: user.id }, section: { semesterId: cycle.semesterId } }, include: { section: { include: { course: true, classMeetings: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }, { meetingId: "asc" }] } } } }, orderBy: [{ section: { course: { courseCode: "asc" } } }, { section: { sectionCode: "asc" } }, { sectionId: "asc" }] });
    result.sections = assignments.map(({ section }) => { const meetings = section.classMeetings.map(meeting => ({ id: meeting.meetingId, day: meeting.dayOfWeek, startTime: meeting.startTime, endTime: meeting.endTime, location: meeting.location })); return { id: section.sectionId, label: `${section.course.courseCode}.${section.sectionCode} ? ${section.course.courseTitle}`, meetings, options: proposedMeetingOptions(meetings, now, new Date(cycle.observationDeadline), cycle) }; });
  }
  if (user.permissions.includes("signups.read.own")) {
    const signup = await db.evaluationSignup.findFirst({ where: { professor: { userId: user.id }, cycleId: cycle.id } });
    if (signup) result.existingSignup = { id: signup.signupId, sectionId: signup.sectionId, signedUpAt: signup.signupDate.toISOString() };
  }
  const reason = signupBlockReason(user, dashboard, !!result.existingSignup);
  result.signup.allowed = !reason && result.sections.some(section => section.options.length);
  result.signup.reason = reason || (result.signup.allowed ? "" : "No unambiguous scheduled class dates are available before the observation deadline.");
  if (dashboard.currentObservation) {
    const record = await db.observation.findFirst({ where: { observationId: dashboard.currentObservation.id, cycleId: cycle.id, OR: [{ signup: { professor: { userId: user.id } } }, { observer: { userId: user.id } }] }, include: { observer: { include: { user: true } }, signup: { include: { professor: { include: { user: true } }, section: { include: { course: true, classMeetings: true } } } }, timeOptions: { orderBy: { preferredDate: "asc" } } } });
    if (record) {
      const section = record.signup.section;
      const meetings = section.classMeetings.map(meeting => ({ id: meeting.meetingId, day: meeting.dayOfWeek, startTime: meeting.startTime, endTime: meeting.endTime, location: meeting.location }));
      result.observation = { id: record.observationId, course: section.course.courseCode, section: section.sectionCode, observee: record.signup.professor.user.fullName, observer: record.observer?.user.fullName ?? null, status: record.status, scheduledAt: record.scheduledAt?.toISOString() ?? null, participation: record.signup.professor.userId === user.id ? "observee" : "observer", meetings, proposedDates: record.timeOptions.flatMap(item => { const option = meetingForDate(item.preferredDate.toISOString().slice(0,10), meetings); return option ? [option] : []; }) };
    }
  }
  if (dashboard.access.observations) result.requests = result.links.requests.filter(request => request.status === "PENDING" && !request.expired).map(request => ({ ...request, options: request.options.map(option => ({ date: option.date, meetingTime: option.meetingTime })) }));
  return result;
}
