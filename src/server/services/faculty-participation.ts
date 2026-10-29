import "server-only";
import type { AccountUser } from "../account-auth";
import { facultyTransaction, notifyCommittee, requireFacultyGrants, touchObservation, workflowId, workflowInput, workflowObservation } from "./faculty-invitations";
import { createObservationAlert } from "./alerts";
import { ConfigurationError } from "../configuration-validation";
import { FacultyActionError } from "./faculty-actions";

export async function reportFacultyIssue(user: AccountUser, body: unknown) {
  requireFacultyGrants(user, "profile.read.own", "observations.read.own");
  const input = workflowInput(body, ["observationId", "kind", "reason", "details", "creationKey"]), id = workflowId(input.observationId);
  if (!["ALERT", "NOT_OCCURRED"].includes(String(input.kind)) || typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 2000
    || typeof input.details !== "string" || input.details.length > 20000) throw new FacultyActionError("Provide a reason and valid details.", 400);
  const reason = input.reason.trim(), details = input.details;
  if(input.kind === "ALERT") {
    try { return await facultyTransaction(async db => {
      const result = await createObservationAlert(db, user, id, { reasonCode: "OTHER", reason, details, ...(input.creationKey===undefined?{}:{creationKey:input.creationKey}) });
      return { message: result.created ? "Your alert was saved and the Assessment Committee was notified." : "Your alert is already recorded.", alert: result.alert };
    }); } catch(error) { if(error instanceof ConfigurationError) throw new FacultyActionError(error.message,error.status); throw error; }
  }
  return facultyTransaction(async db => {
    const record = await workflowObservation(db, id);
    const observee = record.signup.professor.userId === user.id;
    const observer = record.observerId && (await db.professor.findUnique({ where: { professorId: record.observerId } }))?.userId === user.id;
    if (input.kind === "ALERT") { if (!observee) throw new FacultyActionError("Forbidden", 403); requireFacultyGrants(user, "invitations.send.own"); }
    else {
      if (!observee && !observer) throw new FacultyActionError("Forbidden", 403);
      requireFacultyGrants(user, observee ? "assessment.acknowledge.own" : "assessment.submit.own");
      if (!record.scheduledAt || record.scheduledAt > new Date() || record.completedAt || record.signedAssessment?.observerSignedAt || record.signedAssessment?.observeeSignedAt) throw new FacultyActionError("Report non-occurrence after the appointment starts and before any acknowledgement.");
    }
    await touchObservation(db, record);
    const existing = await db.facultyIssue.findUnique({ where: { observationId_reportedBy_kind_occurrenceKey: { observationId: id, reportedBy: user.id, kind: String(input.kind), occurrenceKey: "initial" } } });
    if (existing) return { message: "Your report is already recorded." };
    const issue = await db.facultyIssue.create({ data: { observationId: id, reportedBy: user.id, kind: String(input.kind), reason, details } });
    if (input.kind === "NOT_OCCURRED") await db.observation.update({ where: { observationId: id }, data: { status: "NOT_OCCURRED" } });
    await notifyCommittee(db, input.kind === "ALERT" ? "Faculty needs assistance" : "Observation did not occur", `Observation ${id}: ${reason}`, { eventKey: `faculty-issue:${issue.issueId}`, observationId: id });
    return { message: "Your report was saved and the Assessment Committee was notified." };
  });
}

export async function submitFacultyFeedback(user: AccountUser, body: unknown) {
  requireFacultyGrants(user, "profile.read.own", "feedback.submit.own");
  const input = workflowInput(body, ["observationId", "satisfaction", "difficulties", "suggestions", "attachmentIds"]), id = workflowId(input.observationId);
  if (input.attachmentIds !== undefined && (!Array.isArray(input.attachmentIds) || input.attachmentIds.length > 3)) throw new FacultyActionError("Choose at most three supporting files.", 400);
  const attachmentIds = (input.attachmentIds as unknown[] | undefined ?? []).map(workflowId);
  if (new Set(attachmentIds).size !== attachmentIds.length) throw new FacultyActionError("Duplicate attachments.", 400);
  if (!Number.isInteger(input.satisfaction) || (input.satisfaction as number) < 1 || (input.satisfaction as number) > 5
    || typeof input.difficulties !== "string" || input.difficulties.length > 20000 || typeof input.suggestions !== "string" || input.suggestions.length > 20000) throw new FacultyActionError("Choose a satisfaction rating from 1 to 5 and valid comments.", 400);
  const difficulties = input.difficulties, suggestions = input.suggestions;
  return facultyTransaction(async db => {
    const record = await workflowObservation(db, id), now = new Date();
    const professor = await db.professor.findUnique({ where: { userId: user.id } });
    if (!professor || ![record.signup.professorId, record.observerId].includes(professor.professorId)) throw new FacultyActionError("Forbidden", 403);
    if (record.cycle.observationDeadline >= now || record.cycle.feedbackDeadline < now) throw new FacultyActionError("Process feedback is outside its submission window.");
    await touchObservation(db, record);
    const feedbackRole = record.signup.professorId === professor.professorId ? "OBSERVEE" : "OBSERVER";
    const existing = await db.processFeedback.findUnique({ where: { observationId_professorId_feedbackRole: { observationId: id, professorId: professor.professorId, feedbackRole } } });
    if (existing) return { message: "Your feedback is already recorded." };
    const attachments = await db.feedbackAttachment.findMany({ where: { attachmentId: { in: attachmentIds }, ownerId: user.id, observationId: id, feedbackId: null } });
    if (attachments.length !== attachmentIds.length) throw new FacultyActionError("Supporting files must be your own unattached uploads for this observation.", 403);
    const feedback = await db.processFeedback.create({ data: { observationId: id, professorId: professor.professorId, feedbackRole, satisfaction: input.satisfaction as number, difficulties, suggestions } });
    await db.feedbackAttachment.updateMany({ where: { attachmentId: { in: attachmentIds } }, data: { feedbackId: feedback.feedbackId } });
    return { message: "Your process feedback was saved." };
  });
}
