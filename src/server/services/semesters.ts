import type { PrismaClient } from "../../generated/prisma/client";
import { ConfigurationError, date, fields, invalid, object, revision, timeZone, uuid, type ConfigurationUser } from "../configuration-validation";
import { authorize, semesterResponse } from "../queries/configuration";
import { removeFacultyAttachmentFile } from "./faculty-attachments";

export async function createSemester(prisma: PrismaClient, user: ConfigurationUser, value: unknown) {
  authorize(user, ["cycles.manage"]);
  const body = object(value); fields(body, ["year", "season", "startsOn", "endsOn", "timeZone"]);
  if (!Number.isInteger(body.year) || Number(body.year) < 2000 || Number(body.year) > 2099 || !["Spring", "Summer", "Fall"].includes(String(body.season))) invalid("Choose Spring, Summer or Fall and a year from 2000 to 2099.");
  const startsOn = date(body.startsOn), endsOn = date(body.endsOn), zone = timeZone(body.timeZone);
  if (startsOn > endsOn) invalid("Semester start must be on or before its end.");
  const suffix = { Spring: "s", Summer: "u", Fall: "f" }[body.season as "Spring" | "Summer" | "Fall"];
  return semesterResponse(await prisma.semester.create({ data: { termCode: `${String(body.year).slice(2)}${suffix}`, termName: `${body.season} ${body.year}`, startsOn: new Date(startsOn), endsOn: new Date(endsOn), timeZone: zone } }));
}

export async function deleteSemester(prisma: PrismaClient, user: ConfigurationUser, id: string, value: unknown) {
  authorize(user, ["cycles.manage"]); const semesterId = uuid(id);
  const body = object(value); fields(body, ["expectedRevision", "expectedCycleRevision"]);
  const expectedRevision = revision(body.expectedRevision);
  const storageKeys = await prisma.$transaction(async db => {
    const semester = await db.semester.findUnique({ where: { semesterId }, include: { evaluationCycles: true } });
    if (!semester) throw new ConfigurationError(404, "NOT_FOUND", "Semester not found.");
    if (semester.revision !== expectedRevision || (semester.evaluationCycles.length ? semester.evaluationCycles.some(c => c.revision !== revision(body.expectedCycleRevision)) : body.expectedCycleRevision !== null)) throw new ConfigurationError(409, "STALE_REVISION", "Semester or cycle changed. Reload before deleting.");
    const cycles = semester.evaluationCycles.map(c => c.cycleId);
    const observations = await db.observation.findMany({ where: { cycleId: { in: cycles } }, select: { observationId: true } });
    const ids = observations.map(o => o.observationId);
    const attachments = await db.feedbackAttachment.findMany({ where: { observationId: { in: ids } }, select: { storageKey: true } });
    await db.feedbackAttachment.deleteMany({ where: { observationId: { in: ids } } });
    await db.processFeedback.deleteMany({ where: { observationId: { in: ids } } });
    await db.facultyIssue.deleteMany({ where: { observationId: { in: ids } } });
    await db.signedAssessment.deleteMany({ where: { observationId: { in: ids } } });
    await db.lateAcceptanceApproval.deleteMany({ where: { attempt: { candidate: { observationId: { in: ids } } } } });
    await db.invitationAttempt.deleteMany({ where: { candidate: { observationId: { in: ids } } } });
    await db.observationCandidate.deleteMany({ where: { observationId: { in: ids } } });
    // Explicit, authorized permanent semester deletion is the sole destructive
    // lifecycle here. Normal generation/release never deletes historical lists.
    await db.observation.updateMany({ where: { observationId: { in: ids } }, data: { currentDraftListId: null, currentReleasedListId: null } });
    await db.recommendationList.deleteMany({ where: { observationId: { in: ids } } });
    await db.observationTimeOption.deleteMany({ where: { observationId: { in: ids } } });
    await db.observation.deleteMany({ where: { observationId: { in: ids } } });
    await db.evaluationSignup.deleteMany({ where: { cycleId: { in: cycles } } });
    await db.reminderDispatch.deleteMany({ where: { cycleId: { in: cycles } } });
    await db.notification.deleteMany({ where: { targetId: { in: [...ids, ...cycles] }, targetKind: { in: ["observation", "evaluationCycle", "cycle"] } } });
    await db.evaluationCycle.deleteMany({ where: { semesterId } });
    await db.teaches.deleteMany({ where: { section: { semesterId } } });
    await db.classMeeting.deleteMany({ where: { section: { semesterId } } });
    await db.courseSection.deleteMany({ where: { semesterId } });
    await db.semester.delete({ where: { semesterId } });
    return attachments.map(a => a.storageKey);
  }, { isolationLevel: "Serializable", timeout: 20000 });
  // File removal happens after commit so rollback never destroys retained evidence.
  await Promise.all(storageKeys.map(key => removeFacultyAttachmentFile(key).catch(() => { console.error("Deleted semester attachment file cleanup failed."); })));
  return { deleted: true };
}
