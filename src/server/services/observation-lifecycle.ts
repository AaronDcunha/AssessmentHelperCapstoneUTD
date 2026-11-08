import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import type { AccountUser } from "../account-auth";
import { protectedObservation } from "../observation-protection";
import { getPrisma } from "../prisma";
import { removeFacultyAttachmentFile } from "./faculty-attachments";
import { FacultyActionError } from "./faculty-errors";
import { workflowId, workflowInput } from "./faculty-invitations";

type Tx = Prisma.TransactionClient;
type Manifest = { id: string; expectedRevision: number };

function nonnegative(value: unknown, name = "expectedRevision") {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new FacultyActionError(`${name} must be a nonnegative integer.`, 400);
  return value;
}
function requireGrant(user: Pick<AccountUser, "permissions">, grant: string) {
  if (!user.permissions.includes(grant)) throw new FacultyActionError("Forbidden", 403);
}
async function latestTemplate(db: Tx) {
  const template = await db.observationTemplate.findFirst({ where: { status: "published", isActive: true, archivedAt: null }, orderBy: [{ publishedAt: "desc" }, { templateId: "desc" }], select: { templateId: true } });
  if (!template) throw new FacultyActionError("A published active template is required before replacing an observation.");
  return template.templateId;
}

async function removeObservationGraph(db: Tx, observationId: string) {
  const attachments = await db.feedbackAttachment.findMany({ where: { observationId }, select: { storageKey: true } });
  const sending = await db.notificationEmail.findFirst({ where: { status: "sending", OR: [{ leaseUntil: null }, { leaseUntil: { gt: new Date() } }], notification: { targetKind: "observation", targetId: observationId } }, select: { notificationId: true } });
  if (sending) throw new FacultyActionError("A notification for this observation is currently being sent. Retry after delivery finishes.");
  const notifications = await db.notification.findMany({ where: { targetKind: "observation", targetId: observationId }, select: { notificationId: true } });
  const notificationIds = notifications.map(row => row.notificationId);
  if (notificationIds.length) {
    await db.notificationEmail.updateMany({ where: { notificationId: { in: notificationIds }, status: { in: ["pending", "sending"] } }, data: { status: "skipped", leaseToken: null, leaseUntil: null, lastError: "Target observation was deleted by an authorized administrator." } });
    await db.notification.updateMany({ where: { notificationId: { in: notificationIds } }, data: { targetKind: null, targetId: null, inAppEnabled: false, emailRequested: false } });
  }
  await db.feedbackAttachment.deleteMany({ where: { observationId } });
  await db.processFeedback.deleteMany({ where: { observationId } });
  await db.facultyIssue.deleteMany({ where: { observationId } });
  await db.signedAssessment.deleteMany({ where: { observationId } });
  await db.lateAcceptanceApproval.deleteMany({ where: { attempt: { candidate: { observationId } } } });
  await db.observationAssignmentHistory.deleteMany({ where: { observationId } });
  // Idempotency/operation receipts intentionally remain as audit evidence. They
  // have no foreign key to the observation and must not be replayed as new work.
  await db.invitationAttempt.deleteMany({ where: { candidate: { observationId } } });
  await db.observationCandidate.deleteMany({ where: { observationId } });
  await db.observation.update({ where: { observationId }, data: { currentDraftListId: null, currentReleasedListId: null } });
  await db.recommendationList.deleteMany({ where: { observationId } });
  await db.observationTimeOption.deleteMany({ where: { observationId } });
  await db.observation.delete({ where: { observationId } });
  return attachments.map(row => row.storageKey);
}

async function cleanupFiles(keys: string[]) {
  await Promise.all(keys.map(key => removeFacultyAttachmentFile(key).catch(() => console.error("Deleted observation attachment cleanup failed."))));
}

export async function deleteObservation(user: AccountUser, id: string, value: unknown) {
  requireGrant(user, "observations.delete");
  const observationId = workflowId(id), body = workflowInput(value, ["expectedRevision"]), expected = nonnegative(body.expectedRevision);
  const prisma = getPrisma();
  const result = await prisma.$transaction(async db => {
    const record = await db.observation.findUnique({ where: { observationId }, include: { signedAssessment: true, timeOptions: true, signup: true } });
    // A second browser tab may still hold the revision of a record that was
    // deleted in the first tab. Treat that as an optimistic-concurrency
    // conflict instead of suggesting that the original identifier was invalid.
    if (!record) throw new FacultyActionError("The observation changed or was already deleted. Reload before deleting.", 409);
    if (record.workflowRevision !== expected) throw new FacultyActionError("The observation changed. Reload before deleting.");
    if (protectedObservation(record)) throw new FacultyActionError("Signed, completed, closed, or non-occurring observations must be retained for history.");
    const locked = await db.observation.updateMany({ where: { observationId, workflowRevision: expected }, data: { workflowRevision: { increment: 1 } } });
    if (!locked.count) throw new FacultyActionError("The observation changed. Reload before deleting.");
    const templateId = await latestTemplate(db);
    const options = record.timeOptions.map(option => ({ preferredDate: option.preferredDate, startsAt: option.startsAt, endsAt: option.endsAt, timeZone: option.timeZone, location: option.location }));
    const storageKeys = await removeObservationGraph(db, observationId);
    const replacementObservationId = randomUUID();
    await db.observation.create({ data: { observationId: replacementObservationId, signupId: record.signupId, cycleId: record.cycleId, status: "PENDING", assignedTemplateId: templateId,
      timeOptions: { create: options } } });
    await db.evaluationSignup.update({ where: { signupId: record.signupId }, data: { revision: { increment: 1 } } });
    return { storageKeys, response: { deleted: true, deletedObservationId: observationId, replacementObservationId, signupId: record.signupId, revision: 0 } };
  }, { isolationLevel: "Serializable", timeout: 20000 });
  await cleanupFiles(result.storageKeys);
  return result.response;
}

export async function deleteSignup(user: AccountUser, id: string, value: unknown) {
  requireGrant(user, "signups.delete");
  const signupId = workflowId(id), body = workflowInput(value, ["expectedRevision", "observations"]), expected = nonnegative(body.expectedRevision);
  if (!Array.isArray(body.observations) || body.observations.length > 100) throw new FacultyActionError("Provide the observations and revisions shown in the confirmation.", 400);
  const manifest: Manifest[] = body.observations.map(item => {
    const row = workflowInput(item, ["id", "expectedRevision"]);
    return { id: workflowId(row.id), expectedRevision: nonnegative(row.expectedRevision, "observation expectedRevision") };
  });
  if (new Set(manifest.map(row => row.id)).size !== manifest.length) throw new FacultyActionError("The observation manifest contains duplicates.", 400);
  const prisma = getPrisma();
  const result = await prisma.$transaction(async db => {
    const signup = await db.evaluationSignup.findUnique({ where: { signupId }, include: { observations: { include: { signedAssessment: true } } } });
    if (!signup) throw new FacultyActionError("The signup changed or was already deleted. Reload before deleting.", 409);
    if (signup.revision !== expected) throw new FacultyActionError("The signup changed. Reload before deleting.");
    const actual = [...signup.observations].sort((a,b) => a.observationId.localeCompare(b.observationId));
    const supplied = [...manifest].sort((a,b) => a.id.localeCompare(b.id));
    if (actual.length !== supplied.length || actual.some((row,index) => row.observationId !== supplied[index]?.id || row.workflowRevision !== supplied[index]?.expectedRevision)) throw new FacultyActionError("The signup observations changed. Reload the confirmation before deleting.");
    if (actual.some(protectedObservation)) throw new FacultyActionError("This signup contains a signed, completed, closed, or non-occurring observation that must be retained.");
    const locked = await db.evaluationSignup.updateMany({ where: { signupId, revision: expected }, data: { revision: { increment: 1 } } });
    if (!locked.count) throw new FacultyActionError("The signup changed. Reload before deleting.");
    const storageKeys: string[] = [];
    for (const observation of actual) {
      const observationLock = await db.observation.updateMany({ where: { observationId: observation.observationId, workflowRevision: observation.workflowRevision }, data: { workflowRevision: { increment: 1 } } });
      if (!observationLock.count) throw new FacultyActionError("An observation changed. Reload before deleting.");
      storageKeys.push(...await removeObservationGraph(db, observation.observationId));
    }
    await db.evaluationSignup.delete({ where: { signupId } });
    return { storageKeys, response: { deleted: true, signupId, deletedObservationIds: actual.map(row => row.observationId) } };
  }, { isolationLevel: "Serializable", timeout: 20000 });
  await cleanupFiles(result.storageKeys);
  return result.response;
}

type StoredResponses = { answers?: Record<string, string | number>; comments?: string; promptAnswers?: Record<string, string> };
export async function reassignObservationTemplate(user: AccountUser, id: string, value: unknown) {
  requireGrant(user, "templates.manage"); requireGrant(user, "observations.read");
  const observationId = workflowId(id), body = workflowInput(value, ["templateId", "expectedRevision", "confirmImpact"]);
  const templateId = workflowId(body.templateId), expected = nonnegative(body.expectedRevision);
  if (body.confirmImpact !== undefined && typeof body.confirmImpact !== "boolean") throw new FacultyActionError("confirmImpact must be true or false.", 400);
  return getPrisma().$transaction(async db => {
    const [record, target] = await Promise.all([
      db.observation.findUnique({ where: { observationId }, include: { signedAssessment: true } }),
      db.observationTemplate.findUnique({ where: { templateId }, include: { criteria: true } }),
    ]);
    if (!record) throw new FacultyActionError("Observation not found.", 404);
    if (!target || target.status !== "published" || !target.isActive || target.archivedAt) throw new FacultyActionError("Choose an active published template.", 400);
    if (record.workflowRevision !== expected) throw new FacultyActionError("The observation changed. Reload before reassigning its template.");
    if (protectedObservation(record)) throw new FacultyActionError("A template cannot be reassigned after either participant acknowledges the form.");
    const assessment = record.signedAssessment;
    const archived: Array<{ kind: string; key: string; value: unknown; reason: string }> = [];
    if (assessment) {
      const source = await db.observationTemplate.findUnique({ where: { templateId: assessment.templateId }, include: { criteria: true } });
      const responses = assessment.responses as StoredResponses;
      if (!source || !responses || typeof responses !== "object" || Array.isArray(responses) || !responses.answers || typeof responses.answers !== "object") throw new FacultyActionError("The saved draft requires manual review before reassignment.");
      const sourceById = new Map(source.criteria.map(c => [c.criterionId, c]));
      const targetByKey = new Map(target.criteria.map(c => [c.criterionKey, c]));
      const answers: Record<string, string | number> = {};
      for (const [sourceId, answer] of Object.entries(responses.answers)) {
        const oldCriterion = sourceById.get(sourceId), next = oldCriterion ? targetByKey.get(oldCriterion.criterionKey) : null;
        const compatible = next && next.questionType === oldCriterion!.questionType && (next.questionType !== "RATING" || (Array.isArray(next.options) && next.options.some(option => option && typeof option === "object" && "value" in option && option.value === answer)));
        if (compatible) answers[next!.criterionId] = answer;
        else archived.push({ kind: "answer", key: oldCriterion?.criterionKey ?? sourceId, value: answer, reason: next ? "question type or scale changed" : "question removed" });
      }
      const prompts = Array.isArray(target.commentPrompts) ? target.commentPrompts : [];
      const promptIds = new Set(prompts.flatMap(item => item && typeof item === "object" && !Array.isArray(item) && typeof item.id === "string" ? [item.id] : []));
      const promptAnswers: Record<string,string> = {};
      for (const [promptId, answer] of Object.entries(responses.promptAnswers ?? {})) {
        if (promptIds.has(promptId)) promptAnswers[promptId] = answer;
        else archived.push({ kind: "comment", key: promptId, value: answer, reason: "comment prompt removed" });
      }
      if (archived.length && body.confirmImpact !== true) throw new FacultyActionError(`${archived.length} saved answer(s) or comment(s) are incompatible. Confirm the reassignment to archive them without silent loss.`);
      const prior = Array.isArray(assessment.responseArchive) ? assessment.responseArchive : [];
      await db.signedAssessment.update({ where: { assessmentId: assessment.assessmentId }, data: { templateId, responses: { answers, comments: responses.comments ?? "", promptAnswers }, responseArchive: [...prior, ...archived] as Prisma.InputJsonValue } });
    }
    const changed = await db.observation.updateMany({ where: { observationId, workflowRevision: expected }, data: { assignedTemplateId: templateId, workflowRevision: { increment: 1 } } });
    if (!changed.count) throw new FacultyActionError("The observation changed. Reload before reassigning its template.");
    return { observationId, templateId, revision: expected + 1, archivedResponseCount: archived.length };
  }, { isolationLevel: "Serializable", timeout: 20000 });
}
