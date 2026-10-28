import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import type { AccountUser } from "../account-auth";
import { getPrisma } from "../prisma";
import { FacultyActionError } from "./faculty-errors";
import { meetingOccurrence } from "./faculty-meetings";
import { facultyDate, type WeeklyMeeting } from "./faculty-calendar";
import { effectivePermissions } from "../admin-validation";
import { createWorkflowNotification } from "./notifications";
import { grantInclude } from "../queries/admin";

type Tx = Prisma.TransactionClient;
type Identity = Pick<AccountUser, "id" | "permissions">;
export function requireFacultyGrants(user: Identity, ...grants: string[]) {
  if (!grants.every(grant => user.permissions.includes(grant))) throw new FacultyActionError("Forbidden", 403);
}
export function workflowInput(body: unknown, allowed: string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key))) throw new FacultyActionError("Invalid request fields.", 400);
  return body as Record<string, unknown>;
}
export function workflowId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)) throw new FacultyActionError("A valid record identifier is required.", 400);
  return value;
}
export async function facultyTransaction<T>(action: (db: Tx) => Promise<T>) {
  try { return await getPrisma().$transaction(action, { isolationLevel: "Serializable", timeout: 20000 }); }
  catch (error) {
    if (["P2034", "P2002"].includes((error as { code?: string }).code ?? "")) throw new FacultyActionError("This record changed. Reload and try again.");
    throw error;
  }
}
const observationInclude = { signup: { include: { professor: true, section: { include: { classMeetings: true, course: true, semester: true } } } }, cycle: true, signedAssessment: true, timeOptions: true } as const;
export async function workflowObservation(db: Tx, id: string) {
  const record = await db.observation.findUnique({ where: { observationId: id }, include: observationInclude });
  if (!record) throw new FacultyActionError("Observation not found.", 404);
  return record;
}
type ObservationRecord = Awaited<ReturnType<typeof workflowObservation>>;
export async function touchObservation(db: Tx, record: ObservationRecord) {
  const changed = await db.observation.updateMany({ where: { observationId: record.observationId, workflowRevision: record.workflowRevision }, data: { workflowRevision: { increment: 1 } } });
  if (!changed.count) throw new FacultyActionError("The observation changed. Reload before continuing.");
}
function open(record: ObservationRecord, now: Date) {
  if (record.completedAt || record.signedAssessment?.isLocked || ["COMPLETED", "CANCELLED", "CANCELED", "NOT_OCCURRED"].includes(record.status.toUpperCase()) || record.cycle.observationDeadline <= now) throw new FacultyActionError("The observation is closed or its deadline has passed.");
}
const weekly = (meetings: ObservationRecord["signup"]["section"]["classMeetings"]): WeeklyMeeting[] => meetings.map(meeting => ({ id: meeting.meetingId, day: meeting.dayOfWeek, startTime: meeting.startTime, endTime: meeting.endTime, location: meeting.location }));
export function availableOption(record: ObservationRecord, id: string, now: Date) {
  const option = record.timeOptions.find(option => option.timeOptionId === id);
  if (!option) throw new FacultyActionError("Choose a proposed meeting from this observation.", 400);
  const semester = record.signup.section.semester, date = option.preferredDate.toISOString().slice(0, 10);
  const current = meetingOccurrence(date, weekly(record.signup.section.classMeetings), semester.timeZone);
  if (!semester.startsOn || !semester.endsOn || date < semester.startsOn.toISOString().slice(0, 10) || date > semester.endsOn.toISOString().slice(0, 10)
    || date >= facultyDate(record.cycle.observationDeadline, semester.timeZone) || !current || current.startsAt <= now) throw new FacultyActionError("This meeting is no longer available.");
  if (option.startsAt && (option.startsAt.getTime() !== current.startsAt.getTime() || option.endsAt?.getTime() !== current.endsAt.getTime())) throw new FacultyActionError("The class schedule changed. Its proposed meeting needs review.");
  return { ...current, timeOptionId: id, date };
}

export async function observerAvailable(db: Tx, record: ObservationRecord, professorId: string, option: ReturnType<typeof availableOption>) {
  if (professorId === record.signup.professorId) return false;
  const profile = await db.professor.findUnique({ where: { professorId }, include: { user: true, teaches: { include: { section: { include: { classMeetings: true, course: true, semester: true } } } } } });
  if (!profile?.user.isActive || profile.departmentId !== record.signup.professor.departmentId) return false;
  const assignments = profile.teaches.filter(item => item.section.semesterId === record.signup.section.semesterId);
  if (!assignments.some(item => item.section.course.courseLevel === record.signup.section.course.courseLevel)) return false;
  if (!await db.evaluationSignup.findUnique({ where: { cycleId_professorId: { cycleId: record.cycleId, professorId } } })) return false;
  for (const item of assignments) {
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${option.date}T12:00:00Z`));
    for (const meeting of item.section.classMeetings.filter(meeting => meeting.dayOfWeek === weekday)) {
      const own = meetingOccurrence(option.date, weekly([meeting]), item.section.semester.timeZone);
      if (!own || (own.startsAt < option.endsAt && own.endsAt > option.startsAt)) return false;
    }
  }
  const assigned = await db.observation.findMany({ where: { observationId: { not: record.observationId }, observerId: professorId, scheduledAt: { lt: option.endsAt }, status: { notIn: ["CANCELLED", "CANCELED", "NOT_OCCURRED"] } }, include: { signup: { include: { section: { include: { classMeetings: true, semester: true } } } } } });
  for (const other of assigned) {
    if (!other.scheduledAt) continue;
    const semester = other.signup.section.semester;
    const end = other.scheduledEndsAt ?? meetingOccurrence(facultyDate(other.scheduledAt, semester.timeZone), weekly(other.signup.section.classMeetings), semester.timeZone)?.endsAt;
    if (!end || end > option.startsAt) return false;
  }
  return true;
}
type NotificationContext = { eventKey: string; observationId: string };
async function notify(db: Tx, userId: string, title: string, message: string, context: NotificationContext) {
  await createWorkflowNotification(db, { userId, title, message, type: "FACULTY_WORKFLOW", ...context });
}
export async function notifyCommittee(db: Tx, title: string, message: string, context: NotificationContext) {
  const roles = await db.role.findMany({ include: grantInclude });
  const roleIds = roles.filter(role => effectivePermissions(roles, [role.roleId]).includes("late-acceptance.review")).map(role => role.roleId);
  const recipients = await db.appUser.findMany({ where: { isActive: true, userRoles: { some: { roleId: { in: roleIds } } } }, select: { userId: true } });
  for (const recipient of recipients) await notify(db, recipient.userId, title, message, context);
}
async function invite(db: Tx, candidateId: string, record: ObservationRecord, now: Date) {
  const latest = await db.invitationAttempt.findFirst({ where: { candidateId }, orderBy: { number: "desc" } });
  const expiresAt = new Date(Math.min(now.getTime() + 48 * 3600000, record.cycle.observationDeadline.getTime()));
  if (expiresAt <= now) throw new FacultyActionError("The invitation deadline has passed.");
  await db.invitationAttempt.create({ data: { candidateId, number: (latest?.number ?? 0) + 1, invitedAt: now, expiresAt } });
  const candidate = await db.observationCandidate.update({ where: { candidateId }, data: { status: "PENDING", invitedAt: now, expiresAt, respondedAt: null, acceptedOptionId: null }, include: { professor: true } });
  await notify(db, candidate.professor.userId, "Observation invitation", "You have an observation invitation. Choose an available meeting before its response deadline.", { eventKey: `invitation:${candidateId}:${(latest?.number ?? 0) + 1}`, observationId: record.observationId });
}

export async function generateRecommendations(user: Identity, cycleId: string) {
  requireFacultyGrants(user, "recommendations.generate"); workflowId(cycleId);
  return facultyTransaction(async db => {
    const cycle = await db.evaluationCycle.findUnique({ where: { cycleId } });
    const now = new Date();
    if (!cycle || cycle.signupDeadline >= now || cycle.observationDeadline <= now) throw new FacultyActionError("Generate recommendations after signup closes and before the observation deadline.");
    const generationId = randomUUID();
    const records = await db.observation.findMany({ where: { cycleId, observerId: null, recommendationsReleasedAt: null, status: "PENDING" }, orderBy: { observationId: "asc" } });
    let generatedCount = 0;
    for (const item of records) {
      const record = await workflowObservation(db, item.observationId); open(record, now); await touchObservation(db, record);
      await db.observationCandidate.deleteMany({ where: { observationId: record.observationId, status: "ELIGIBLE", invitedAt: null, attempts: { none: {} } } });
      const pool = await db.evaluationSignup.findMany({ where: { cycleId, professorId: { not: record.signup.professorId } }, orderBy: { professorId: "asc" } });
      let count = 0;
      for (const member of pool) {
        if (count === 5) break;
        let compatible = false;
        for (const option of record.timeOptions) {
          try { if (await observerAvailable(db, record, member.professorId, availableOption(record, option.timeOptionId, now))) compatible = true; }
          catch (error) { if (!(error instanceof FacultyActionError)) throw error; }
        }
        if (!compatible) continue;
        await db.observationCandidate.upsert({ where: { observationId_professorId: { observationId: record.observationId, professorId: member.professorId } }, create: { observationId: record.observationId, professorId: member.professorId }, update: {} });
        count++;
      }
      generatedCount += count;
      await db.observation.update({ where: { observationId: record.observationId }, data: { recommendationGenerationId: generationId } });
      if (count < 5) await notifyCommittee(db, "Observer list needs attention", `Observation ${record.observationId} has ${count} compatible candidates.`, { eventKey: `recommendation-shortfall:${generationId}:${record.observationId}`, observationId: record.observationId });
    }
    return { generationId, generatedCount };
  });
}

export async function declineFacultyInvitation(user: Identity, body: unknown) {
  requireFacultyGrants(user, "profile.read.own", "observations.read.own", "invitations.respond.own");
  const input = workflowInput(body, ["candidateId", "attemptId"]), candidateId = workflowId(input.candidateId), attemptId = workflowId(input.attemptId);
  return facultyTransaction(async db => {
    const candidate = await db.observationCandidate.findUnique({ where: { candidateId }, include: { professor: true } });
    if (!candidate || candidate.professor.userId !== user.id) throw new FacultyActionError("Forbidden", 403);
    const record = await workflowObservation(db, candidate.observationId); await touchObservation(db, record);
    const now = new Date(); open(record, now);
    const attempt = await db.invitationAttempt.findFirst({ where: { candidateId }, orderBy: { number: "desc" } });
    if (!attempt || attempt.attemptId !== attemptId || record.observerId || candidate.status !== "PENDING" || attempt.status !== "PENDING" || attempt.invitedAt > now || attempt.expiresAt <= now) throw new FacultyActionError("This invitation changed, expired or was already answered.");
    await db.observationCandidate.update({ where: { candidateId }, data: { status: "DECLINED", respondedAt: now } });
    await db.invitationAttempt.update({ where: { attemptId }, data: { status: "DECLINED", respondedAt: now } });
    await notify(db, record.signup.professor.userId, "Observer request declined", "An invited observer declined your observation request.", { eventKey: `invitation-declined:${attemptId}`, observationId: record.observationId });
    return { message: "Invitation declined." };
  });
}

export async function requestLateAcceptance(user: Identity, body: unknown) {
  requireFacultyGrants(user, "profile.read.own", "observations.read.own", "late-acceptance.request.own");
  const input = workflowInput(body, ["candidateId", "attemptId", "reason"]), candidateId = workflowId(input.candidateId), attemptId = workflowId(input.attemptId);
  if (input.reason !== undefined && (typeof input.reason !== "string" || input.reason.length > 2000)) throw new FacultyActionError("Invalid reason.", 400);
  return facultyTransaction(async db => {
    const candidate = await db.observationCandidate.findUnique({ where: { candidateId }, include: { professor: true } });
    if (!candidate || candidate.professor.userId !== user.id) throw new FacultyActionError("Forbidden", 403);
    const record = await workflowObservation(db, candidate.observationId); await touchObservation(db, record);
    const now = new Date(); open(record, now);
    const latest = await db.invitationAttempt.findFirst({ where: { candidateId }, orderBy: { number: "desc" }, include: { approval: true } });
    if (record.observerId || !latest || latest.attemptId !== attemptId || latest.expiresAt > now || !["PENDING", "EXPIRED"].includes(candidate.status)) throw new FacultyActionError("Only the latest expired, unanswered invitation can request approval.");
    if (latest.approval) return { message: "Your approval request is already recorded." };
    await db.lateAcceptanceApproval.create({ data: { attemptId, reason: input.reason as string | undefined } });
    await notifyCommittee(db, "Expired invitation approval requested", `Review invitation attempt ${attemptId}.`, { eventKey: `late-acceptance:${attemptId}`, observationId: record.observationId });
    return { message: "Approval requested. You cannot accept until AC opens a new response window." };
  });
}

export async function reviewLateAcceptance(user: Identity, approvalId: string, body: unknown) {
  requireFacultyGrants(user, "late-acceptance.review"); workflowId(approvalId);
  const input = workflowInput(body, ["decision"]);
  if (!["approved", "rejected"].includes(String(input.decision))) throw new FacultyActionError("Choose approved or rejected.", 400);
  return facultyTransaction(async db => {
    const approval = await db.lateAcceptanceApproval.findUnique({ where: { approvalId }, include: { attempt: { include: { candidate: true } } } });
    if (!approval) throw new FacultyActionError("Approval request not found.", 404);
    const record = await workflowObservation(db, approval.attempt.candidate.observationId); await touchObservation(db, record);
    const now = new Date(); open(record, now);
    const latest = await db.invitationAttempt.findFirst({ where: { candidateId: approval.attempt.candidateId }, orderBy: { number: "desc" } });
    if (approval.status !== "PENDING" || latest?.attemptId !== approval.attemptId || record.observerId || latest.expiresAt > now) throw new FacultyActionError("The approval request was decided or its invitation was superseded.");
    await db.lateAcceptanceApproval.update({ where: { approvalId }, data: { status: String(input.decision).toUpperCase(), decidedAt: now, decidedBy: user.id } });
    if (input.decision === "approved") await invite(db, approval.attempt.candidateId, record, now);
    return { message: input.decision === "approved" ? "A new response window is open. The observer must accept normally." : "Approval request rejected." };
  });
}

/** Explicit scheduler entry point; never runs on a route import. Limit one automatic
 * resend per candidate, after all uncontacted recommendations, with fresh windows. */
export async function processFacultyInvitationExpiry() {
  const ids = await getPrisma().observation.findMany({ where: { observerId: null, recommendationsReleasedAt: { not: null }, cycle: { observationDeadline: { gt: new Date() } }, status: "PENDING" }, select: { observationId: true } });
  for (const id of ids) await facultyTransaction(async db => {
    const record = await workflowObservation(db, id.observationId); await touchObservation(db, record);
    const now = new Date(); open(record, now);
    if (record.observerId) return;
    const candidates = await db.observationCandidate.findMany({ where: { observationId: record.observationId }, include: { attempts: { orderBy: { number: "desc" }, take: 1 } }, orderBy: { candidateId: "asc" } });
    let expired = false;
    for (const candidate of candidates) {
      const latest = candidate.attempts[0];
      if (candidate.status === "PENDING" && latest && latest.expiresAt <= now) {
        await db.observationCandidate.update({ where: { candidateId: candidate.candidateId }, data: { status: "EXPIRED" } });
        await db.invitationAttempt.update({ where: { attemptId: latest.attemptId }, data: { status: "EXPIRED" } });
        expired = true;
      }
    }
    if (!expired && !candidates.some(candidate => candidate.status === "EXPIRED")) return;
    if (candidates.some(candidate => ["ACCEPTED", "SELECTED"].includes(candidate.status) || (candidate.status === "PENDING" && candidate.expiresAt! > now))) return;
    const uncontacted = candidates.filter(candidate => !candidate.invitedAt);
    const retryable = candidates.filter(candidate => ["EXPIRED", "PENDING"].includes(candidate.status) && candidate.attempts.length && candidate.attempts[0].number < 2);
    const targets = uncontacted.length ? uncontacted : retryable;
    let sent = 0;
    for (const candidate of targets) {
      let compatible = false;
      for (const option of record.timeOptions) {
        try { if (await observerAvailable(db, record, candidate.professorId, availableOption(record, option.timeOptionId, now))) compatible = true; }
        catch (error) { if (!(error instanceof FacultyActionError)) throw error; }
      }
      if (!compatible) continue;
      await invite(db, candidate.candidateId, record, now); sent++;
    }
    if (!sent && uncontacted.length) {
      for (const candidate of retryable) {
        let compatible = false;
        for (const option of record.timeOptions) {
          try { if (await observerAvailable(db, record, candidate.professorId, availableOption(record, option.timeOptionId, now))) compatible = true; }
          catch (error) { if (!(error instanceof FacultyActionError)) throw error; }
        }
        if (compatible) { await invite(db, candidate.candidateId, record, now); sent++; }
      }
    }
    if (sent) await notifyCommittee(db, "Observation invitations automatically sent", `${sent} invitations sent for observation ${record.observationId}; no approval is required.`, { eventKey: `automatic-invitations:${record.observationId}:${record.workflowRevision}`, observationId: record.observationId });
  });
}
export async function releaseRecommendations(user: Identity, cycleId: string, body: unknown) {
  requireFacultyGrants(user, "recommendations.release"); workflowId(cycleId);
  const input = workflowInput(body, ["generationId", "observationIds"]), generationId = workflowId(input.generationId);
  if (input.observationIds !== undefined && (!Array.isArray(input.observationIds) || input.observationIds.length > 500)) throw new FacultyActionError("Invalid observation list.", 400);
  const ids = (input.observationIds as unknown[] | undefined)?.map(workflowId);
  return facultyTransaction(async db => {
    const records = await db.observation.findMany({ where: { cycleId, recommendationGenerationId: generationId, ...(ids ? { observationId: { in: ids } } : {}) } });
    if (!records.length || (ids && records.length !== new Set(ids).size)) throw new FacultyActionError("No matching generated recommendation list was found.", 404);
    for (const item of records) {
      const record = await workflowObservation(db, item.observationId); open(record, new Date());
      if (record.recommendationsReleasedAt) continue; // Retry does not duplicate notifications.
      await touchObservation(db, record);
      await db.observation.update({ where: { observationId: record.observationId }, data: { recommendationsReleasedAt: new Date() } });
      await notify(db, record.signup.professor.userId, "Observer recommendations ready", "Your released observer recommendations are ready for invitations.", { eventKey: `recommendations-released:${record.observationId}`, observationId: record.observationId });
    }
    return { releasedObservationIds: records.map(item => item.observationId) };
  });
}
export async function sendFacultyInvitations(user: Identity, body: unknown) {
  requireFacultyGrants(user, "profile.read.own", "observations.read.own", "invitations.send.own", "recommendations.read.released.own");
  const input = workflowInput(body, ["observationId", "candidateIds"]), id = workflowId(input.observationId);
  if (!Array.isArray(input.candidateIds) || !input.candidateIds.length || input.candidateIds.length > 5) throw new FacultyActionError("Select one to five released candidates.", 400);
  const ids = input.candidateIds.map(workflowId);
  if (new Set(ids).size !== ids.length) throw new FacultyActionError("Duplicate candidates.", 400);
  return facultyTransaction(async db => {
    const record = await workflowObservation(db, id), now = new Date();
    if (record.signup.professor.userId !== user.id) throw new FacultyActionError("Forbidden", 403);
    open(record, now); if (record.observerId || !record.recommendationsReleasedAt) throw new FacultyActionError("A released, unpaired observation is required.");
    await touchObservation(db, record);
    for (const candidateId of ids) {
      const candidate = await db.observationCandidate.findUnique({ where: { candidateId } });
      if (!candidate || candidate.observationId !== id) throw new FacultyActionError("Choose only your released candidates.", 403);
      if (candidate.invitedAt) continue; // Initial-send retries never open another window.
      let compatible = false;
      for (const option of record.timeOptions) {
        try { if (await observerAvailable(db, record, candidate.professorId, availableOption(record, option.timeOptionId, now))) compatible = true; }
        catch (error) { if (!(error instanceof FacultyActionError)) throw error; }
      }
      if (!compatible) throw new FacultyActionError("An observer is no longer available for these meetings.");
      await invite(db, candidateId, record, now);
    }
    return { message: "Invitations sent. Previously contacted candidates retain their existing response windows." };
  });
}
export async function acceptFacultyInvitation(user: Identity, body: unknown) {
  requireFacultyGrants(user, "profile.read.own", "observations.read.own", "invitations.respond.own");
  const input = workflowInput(body, ["candidateId", "meetingOptionId", "attemptId"]);
  const candidateId = workflowId(input.candidateId), optionId = workflowId(input.meetingOptionId), attemptId = workflowId(input.attemptId);
  return facultyTransaction(async db => {
    const candidate = await db.observationCandidate.findUnique({ where: { candidateId }, include: { professor: true } });
    if (!candidate || candidate.professor.userId !== user.id) throw new FacultyActionError("Forbidden", 403);
    const record = await workflowObservation(db, candidate.observationId); await touchObservation(db, record);
    const now = new Date(); open(record, now);
    const attempt = await db.invitationAttempt.findFirst({ where: { candidateId }, orderBy: { number: "desc" } });
    if (!attempt || attempt.attemptId !== attemptId || record.observerId) throw new FacultyActionError("This invitation was superseded or paired.");
    if (candidate.status === "ACCEPTED" && candidate.acceptedOptionId === optionId && attempt.status === "ACCEPTED") return { message: "Your availability is already recorded." };
    if (candidate.status !== "PENDING" || candidate.respondedAt || attempt.status !== "PENDING" || attempt.invitedAt > now || attempt.expiresAt <= now) throw new FacultyActionError("The invitation has expired or was already answered.");
    const option = availableOption(record, optionId, now);
    if (!await observerAvailable(db, record, candidate.professorId, option)) throw new FacultyActionError("The proposed meeting conflicts with your current assignments.");
    await db.observationTimeOption.update({ where: { timeOptionId: optionId }, data: { startsAt: option.startsAt, endsAt: option.endsAt, timeZone: option.timeZone, location: option.location } });
    await db.observationCandidate.update({ where: { candidateId }, data: { status: "ACCEPTED", acceptedOptionId: optionId, respondedAt: now } });
    await db.invitationAttempt.update({ where: { attemptId }, data: { status: "ACCEPTED", respondedAt: now } });
    await notify(db, record.signup.professor.userId, "Observer available", "An observer accepted a proposed meeting. Choose a final observer to confirm the appointment.", { eventKey: `invitation-accepted:${attemptId}`, observationId: record.observationId });
    return { message: "Availability recorded. The observee must select the final observer." };
  });
}
export async function selectFacultyObserver(user: Identity, body: unknown) {
  requireFacultyGrants(user, "profile.read.own", "observations.read.own", "observer.select.own");
  const input = workflowInput(body, ["candidateId"]), candidateId = workflowId(input.candidateId);
  return facultyTransaction(async db => {
    const candidate = await db.observationCandidate.findUnique({ where: { candidateId }, include: { professor: true } });
    if (!candidate) throw new FacultyActionError("Candidate not found.", 404);
    const record = await workflowObservation(db, candidate.observationId);
    if (record.signup.professor.userId !== user.id) throw new FacultyActionError("Forbidden", 403);
    await touchObservation(db, record); const now = new Date(); open(record, now);
    if (record.observerId === candidate.professorId && candidate.status === "SELECTED") return { message: "This appointment is already confirmed." };
    if (record.observerId || candidate.status !== "ACCEPTED" || !candidate.acceptedOptionId) throw new FacultyActionError("Choose an accepted candidate for an unpaired observation.");
    const option = availableOption(record, candidate.acceptedOptionId, now);
    if (!await observerAvailable(db, record, candidate.professorId, option)) throw new FacultyActionError("The observer's availability changed. Choose another compatible observer.");
    await db.observation.update({ where: { observationId: record.observationId }, data: { observerId: candidate.professorId, scheduledAt: option.startsAt, scheduledEndsAt: option.endsAt, status: "CONFIRMED" } });
    await db.observationCandidate.update({ where: { candidateId }, data: { status: "SELECTED" } });
    const others = await db.observationCandidate.findMany({ where: { observationId: record.observationId, candidateId: { not: candidateId }, status: { in: ["PENDING", "ACCEPTED", "ELIGIBLE", "EXPIRED"] } }, include: { professor: true } });
    await db.observationCandidate.updateMany({ where: { candidateId: { in: others.map(other => other.candidateId) } }, data: { status: "CANCELLED" } });
    await db.invitationAttempt.updateMany({ where: { candidateId: { in: others.map(other => other.candidateId) }, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "CANCELLED" } });
    for (const other of others.filter(other => other.invitedAt)) await notify(db, other.professor.userId, "Observation invitation closed", "Another observer was selected for this observation.", { eventKey: `invitation-closed:${candidateId}`, observationId: record.observationId });
    await notify(db, candidate.professor.userId, "Observation appointment confirmed", "You were selected for the meeting you accepted.", { eventKey: `appointment-confirmed:${candidateId}`, observationId: record.observationId });
    await notify(db, user.id, "Observation appointment confirmed", "Your observer and their selected meeting are confirmed.", { eventKey: `appointment-confirmed:${candidateId}`, observationId: record.observationId });
    return { message: "Observer selected and appointment confirmed. Remaining invitations were cancelled." };
  });
}
