import "server-only";
import { randomUUID } from "node:crypto";
import type { AccountUser } from "../account-auth";
import { facultyTransaction, declineFacultyInvitation } from "./faculty-invitations";
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
  return facultyTransaction(async client => {
    const profile = await client.professor.findUnique({ where: { userId: user.id } });
    if (!profile) throw new FacultyActionError("A faculty profile is required.");
    const now = new Date();
    const workspace = await getFacultyWorkflow(user, { database: client, now });
    if (!workspace.signup.allowed || !workspace.dashboard.cycle) throw new FacultyActionError(workspace.signup.reason);
    const cycle = workspace.dashboard.cycle;
    const section = workspace.sections.find(section => section.id === input.sectionId);
    if (!section) throw new FacultyActionError("That section is not assigned to you in the current cycle.", 400);
    if (input.dates.some(date => !section.options.some(option => option.date === date))) throw new FacultyActionError("One or more dates are no longer available. Reload the section schedule.", 400);
    // All eligibility, assignment, schedule and configuration reads share this
    // Serializable transaction. The unique signup key also protects duplicate submissions.
    const signupId = randomUUID(), observationId = randomUUID();
    await client.evaluationSignup.create({ data: { signupId, cycleId: cycle.id, professorId: profile.professorId, sectionId: section.id, signupDate: now } });
    await client.observation.create({ data: { observationId, signupId, cycleId: cycle.id, status: "PENDING" } });
    for (const date of input.dates) {
      const occurrence = meetingOccurrence(date, section.meetings, cycle.timeZone);
      if (!occurrence) throw new FacultyActionError("The proposed meeting cannot be resolved in its configured time zone.");
      await client.observationTimeOption.create({ data: { observationId, preferredDate: new Date(`${date}T00:00:00Z`), startsAt: occurrence.startsAt, endsAt: occurrence.endsAt, timeZone: occurrence.timeZone, location: occurrence.location } });
    }
    if (new Date() >= new Date(cycle.signupDeadline)) throw new FacultyActionError("The signup deadline has passed.");
    return { signupId, observationId, message: "Your signup and proposed dates have been saved. Observer recommendations are not yet released." };
  });
}

export const declineFacultyRequest = declineFacultyInvitation;
