import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { ConfigurationError, deadlines, date, fields, invalid, object, revision, timeZone, uuid, type ConfigurationUser } from "../configuration-validation";
import { authorize, getCycle, semesterResponse } from "../queries/configuration";
import { removeFacultyAttachmentFile } from "./faculty-attachments";

// A caller-generated semester UUID makes atomic creation safely repeatable without
// adding a second semester when the response is lost. Term uniqueness still applies.
export async function createSemester(prisma: PrismaClient, user: ConfigurationUser, value: unknown) {
  authorize(user, ["cycles.manage"]);
  const body = object(value); fields(body, ["id", "year", "season", "startsOn", "endsOn", "timeZone", "deadlines"]);
  if (!Number.isInteger(body.year) || Number(body.year) < 2000 || Number(body.year) > 2099 || !["Spring", "Summer", "Fall"].includes(String(body.season))) invalid("Choose Spring, Summer or Fall and a year from 2000 to 2099.");
  const startsOn = date(body.startsOn), endsOn = date(body.endsOn), zone = timeZone(body.timeZone);
  if (startsOn > endsOn) invalid("Semester start must be on or before its end.");
  const suffix = { Spring: "s", Summer: "u", Fall: "f" }[body.season as "Spring" | "Summer" | "Fall"];
  const id = body.id === undefined ? undefined : uuid(body.id);
  const d = body.deadlines === undefined ? undefined : validatedDeadlines(body.deadlines);
  const data = { termCode: `${String(body.year).slice(2)}${suffix}`, termName: `${body.season} ${body.year}`, startsOn: new Date(startsOn), endsOn: new Date(endsOn), timeZone: zone };
  async function replay(db: Prisma.TransactionClient) {
    if (!id) return null;
    const existing = await db.semester.findUnique({ where: { semesterId: id }, include: { evaluationCycles: true } });
    if (!existing) return null;
    const cycle = existing.evaluationCycles[0];
    if (existing.termCode !== data.termCode || existing.startsOn?.getTime() !== data.startsOn.getTime() || existing.endsOn?.getTime() !== data.endsOn.getTime() || existing.timeZone !== zone ||
      (d ? !cycle || Object.entries(d).some(([key, value]) => cycle[key as keyof typeof d].getTime() !== Date.parse(value)) : !!cycle))
      throw new ConfigurationError(409, "CREATION_KEY_REUSED", "The creation request differs from the saved semester. Reload semesters to review it.");
    return { ...semesterResponse(existing), ...(cycle ? { cycle: await getCycle(db, user, cycle.cycleId) } : {}) };
  }
  try {
    return await prisma.$transaction(async db => {
      const existing = await replay(db); if (existing) return existing;
      const semester = await db.semester.create({ data: { ...data, ...(id ? { semesterId: id } : {}) } });
      const cycle = d ? await db.evaluationCycle.create({ data: { semesterId: semester.semesterId, cycleName: semester.termName, ...deadlineDates(d) } }) : null;
      return { ...semesterResponse(semester), ...(cycle ? { cycle: await getCycle(db, user, cycle.cycleId) } : {}) };
    });
  } catch (error) {
    if (id && error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const existing = await replay(prisma); if (existing) return existing;
    }
    throw error;
  }
}
function validatedDeadlines(value: unknown) {
  const body = object(value); fields(body, ["signupDeadline", "observationDeadline", "feedbackDeadline"]);
  return deadlines(body);
}
function deadlineDates(d: ReturnType<typeof deadlines>) {
  return { signupDeadline: new Date(d.signupDeadline), observationDeadline: new Date(d.observationDeadline), feedbackDeadline: new Date(d.feedbackDeadline) };
}
// Configure a semester which has no cycle, atomically. Existing cycles use the
// established cycle settings endpoint and its two revision checks.
export async function configureSemester(prisma: PrismaClient, user: ConfigurationUser, id: string, value: unknown) {
  authorize(user, ["cycles.manage"]);
  const semesterId = uuid(id), body = object(value);
  fields(body, ["expectedRevision", "startsOn", "endsOn", "timeZone", "deadlines"]);
  const expectedRevision = revision(body.expectedRevision), startsOn = date(body.startsOn), endsOn = date(body.endsOn), zone = timeZone(body.timeZone), d = validatedDeadlines(body.deadlines);
  if (startsOn > endsOn) invalid("Semester start must be on or before its end.");
  return prisma.$transaction(async db => {
    const semester = await db.semester.findUnique({ where: { semesterId }, include: { evaluationCycles: true } });
    if (!semester) throw new ConfigurationError(404, "NOT_FOUND", "Semester not found.");
    if (semester.revision !== expectedRevision || semester.evaluationCycles.length)
      throw new ConfigurationError(409, "STALE_REVISION", "Semester or cycle changed. Reload before saving.");
    const updated = await db.semester.updateMany({ where: { semesterId, revision: expectedRevision }, data: { startsOn: new Date(startsOn), endsOn: new Date(endsOn), timeZone: zone, revision: { increment: 1 } } });
    if (!updated.count) throw new ConfigurationError(409, "STALE_REVISION", "Semester changed. Reload before saving.");
    const created = await db.evaluationCycle.create({ data: { semesterId, cycleName: semester.termName, ...deadlineDates(d) } });
    const cycle = await getCycle(db, user, created.cycleId);
    return { semester: cycle.semester, cycle };
  }, { isolationLevel: "Serializable" });
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
