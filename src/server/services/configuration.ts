import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { ConfigurationError, commentPrompts, criteria, date, deadlines, fields, invalid, object, revision,
  signatureLabels, text, timeZone, uuid, type ConfigurationUser } from "../configuration-validation";
import { authorize, getCycle, getTemplate } from "../queries/configuration";

function missing(message: string): never { throw new ConfigurationError(404, "NOT_FOUND", message); }
function stale(): never { throw new ConfigurationError(409, "STALE_REVISION", "This record changed. Reload it before saving."); }
function deadlineData(d: ReturnType<typeof deadlines>) {
  return { signupDeadline: new Date(d.signupDeadline), observationDeadline: new Date(d.observationDeadline), feedbackDeadline: new Date(d.feedbackDeadline) };
}
async function readCycle(db: Prisma.TransactionClient, id: string, expected: unknown) {
  const rev = revision(expected);
  const cycle = await db.evaluationCycle.findUnique({ where: { cycleId: uuid(id) } });
  if (!cycle) missing("Evaluation cycle not found.");
  if (cycle.revision !== rev) stale();
  return cycle;
}
// Conditional revision updates acquire the write lock and prevent lost edits even
// when another transaction changes the row after our initial read.
async function saveDeadlines(db: Prisma.TransactionClient, id: string, expected: number, d: ReturnType<typeof deadlines>) {
  const result = await db.evaluationCycle.updateMany({ where: { cycleId: id, revision: expected },
    data: { ...deadlineData(d), revision: { increment: 1 } } });
  if (!result.count) stale();
}
export async function createCycle(prisma: PrismaClient, user: ConfigurationUser, input: unknown) {
  authorize(user, ["cycles.manage"]);
  const body = object(input);
  fields(body, ["semesterId", "signupDeadline", "observationDeadline", "feedbackDeadline"]);
  const semesterId = uuid(body.semesterId), d = deadlines(body);
  return prisma.$transaction(async db => {
    const semester = await db.semester.findUnique({ where: { semesterId }, select: { termName: true } });
    if (!semester) missing("Semester not found.");
    const cycle = await db.evaluationCycle.create({ data: { semesterId, cycleName: semester.termName, ...deadlineData(d) } });
    return getCycle(db, user, cycle.cycleId);
  });
}
export async function updateCycle(prisma: PrismaClient, user: ConfigurationUser, id: string, input: unknown) {
  authorize(user, ["cycles.manage"]);
  const body = object(input);
  fields(body, ["expectedRevision", "signupDeadline", "observationDeadline", "feedbackDeadline"]);
  if (!Object.keys(body).some(key => key !== "expectedRevision")) invalid("Provide at least one deadline to update.");
  return prisma.$transaction(async db => {
    const current = await readCycle(db, id, body.expectedRevision);
    const d = deadlines({ signupDeadline: current.signupDeadline.toISOString(), observationDeadline: current.observationDeadline.toISOString(),
      feedbackDeadline: current.feedbackDeadline.toISOString(), ...body });
    await saveDeadlines(db, id, current.revision, d);
    return getCycle(db, user, id);
  });
}
export async function updateSettings(prisma: PrismaClient, user: ConfigurationUser, id: string, input: unknown) {
  authorize(user, ["cycles.manage"]);
  const body = object(input);
  fields(body, ["expectedCycleRevision", "expectedSemesterRevision", "semester", "deadlines"]);
  const semester = object(body.semester);
  fields(semester, ["startsOn", "endsOn", "timeZone"]);
  const startsOn = date(semester.startsOn), endsOn = date(semester.endsOn);
  if (startsOn > endsOn) invalid("Semester startsOn must not follow endsOn.");
  const zone = semester.timeZone === undefined ? undefined : timeZone(semester.timeZone);
  const deadlineBody = object(body.deadlines);
  fields(deadlineBody, ["signupDeadline", "observationDeadline", "feedbackDeadline"]);
  const d = deadlines(deadlineBody), semesterRevision = revision(body.expectedSemesterRevision);
  return prisma.$transaction(async db => {
    const current = await readCycle(db, id, body.expectedCycleRevision);
    await saveDeadlines(db, id, current.revision, d);
    const result = await db.semester.updateMany({ where: { semesterId: current.semesterId, revision: semesterRevision },
      data: { startsOn: new Date(startsOn), endsOn: new Date(endsOn), ...(zone === undefined ? {} : { timeZone: zone }), revision: { increment: 1 } } });
    if (!result.count) stale();
    const cycle = await getCycle(db, user, id);
    return { semester: cycle.semester, cycle };
  });
}

type Questions = ReturnType<typeof criteria>;
async function saveCriteria(db: Prisma.TransactionClient, id: string, questions: Questions, existingIds: Set<string>) {
  for (const question of questions) if (question.id && !existingIds.has(question.id)) invalid("Criterion ID does not belong to this template.");
  const retained = new Set(questions.flatMap(q => q.id ? [q.id] : []));
  if ([...existingIds].some(key => !retained.has(key))) {
    const used = await db.signedAssessment.findFirst({ where: { templateId: id }, select: { assessmentId: true } });
    if (used) throw new ConfigurationError(409, "CRITERIA_IN_USE", "Cannot remove criteria from a template with assessments. Create a new template for major changes.");
  }
  // Recreate in the same transaction to support order/key swaps while retaining
  // criterion IDs and leaving stored assessment response JSON unchanged.
  await db.templateCriterion.deleteMany({ where: { templateId: id } });
  await db.templateCriterion.createMany({ data: questions.map(q => {
    const values = q.options?.map(option => option.value) ?? [];
    return { criterionId: q.id ?? randomUUID(), templateId: id, criterionKey: q.key, criterionText: q.prompt,
      questionType: q.type.toUpperCase(), minRating: values.length ? Math.min(...values) : null,
      maxRating: values.length ? Math.max(...values) : null, weight: q.weight, isRequired: q.required,
      displayOrder: q.order, ...(q.options ? { options: q.options } : {}) };
  }) });
}
function validateTemplate(input: unknown, update: boolean) {
  const body = { ...object(input) };
  fields(body, ["title", "criteria", "commentPrompts", "signatureLabels", ...(update ? ["expectedRevision"] : [])]);
  if (!update || body.title !== undefined) body.title = text(body.title);
  if (!update || body.criteria !== undefined) body.criteria = criteria(body.criteria);
  if (body.commentPrompts !== undefined) body.commentPrompts = commentPrompts(body.commentPrompts).map(prompt => ({ ...prompt, id: prompt.id ?? randomUUID() }));
  if (body.signatureLabels !== undefined) body.signatureLabels = signatureLabels(body.signatureLabels);
  if (update && !Object.keys(body).some(key => key !== "expectedRevision")) invalid("Provide at least one template field to update.");
  return body;
}
export async function createTemplate(prisma: PrismaClient, user: ConfigurationUser, input: unknown) {
  authorize(user, ["templates.manage"]);
  const body = validateTemplate(input, false);
  return prisma.$transaction(async db => {
    const template = await db.observationTemplate.create({ data: { templateName: body.title as string, isActive: false, status: "draft",
      commentPrompts: (body.commentPrompts ?? []) as Prisma.InputJsonValue,
      signatureLabels: (body.signatureLabels ?? { observer: "Observer", observee: "Observee" }) as Prisma.InputJsonValue } });
    await saveCriteria(db, template.templateId, body.criteria as Questions, new Set());
    return getTemplate(db, user, template.templateId);
  });
}
async function readTemplate(db: Prisma.TransactionClient, id: string, expected: unknown) {
  const rev = revision(expected);
  const template = await db.observationTemplate.findUnique({ where: { templateId: uuid(id) }, select: { revision: true, status: true } });
  if (!template) missing("Observation template not found.");
  if (template.revision !== rev) stale();
  return template;
}
export async function updateTemplate(prisma: PrismaClient, user: ConfigurationUser, id: string, input: unknown) {
  authorize(user, ["templates.manage"]);
  const body = validateTemplate(input, true);
  return prisma.$transaction(async db => {
    const current = await readTemplate(db, id, body.expectedRevision);
    const result = await db.observationTemplate.updateMany({ where: { templateId: id, revision: current.revision }, data: {
      ...(body.title === undefined ? {} : { templateName: body.title as string }),
      ...(body.commentPrompts === undefined ? {} : { commentPrompts: body.commentPrompts as Prisma.InputJsonValue }),
      ...(body.signatureLabels === undefined ? {} : { signatureLabels: body.signatureLabels as Prisma.InputJsonValue }),
      revision: { increment: 1 },
    } });
    if (!result.count) stale();
    if (body.criteria !== undefined) {
      const existing = await db.templateCriterion.findMany({ where: { templateId: id }, select: { criterionId: true } });
      await saveCriteria(db, id, body.criteria as Questions, new Set(existing.map(row => row.criterionId)));
    }
    return getTemplate(db, user, id);
  });
}
export async function publishTemplate(prisma: PrismaClient, user: ConfigurationUser, id: string, input: unknown) {
  authorize(user, ["templates.manage"]);
  const body = object(input);
  fields(body, ["expectedRevision"]);
  return prisma.$transaction(async db => {
    const current = await readTemplate(db, id, body.expectedRevision);
    if (current.status !== "draft") throw new ConfigurationError(409, "INVALID_TRANSITION", "Only drafts can be published.");
    const result = await db.observationTemplate.updateMany({ where: { templateId: id, revision: current.revision, status: "draft" },
      data: { status: "published", isActive: true, publishedAt: new Date(), revision: { increment: 1 } } });
    if (!result.count) stale();
    const complete = await getTemplate(db, user, id);
    criteria(complete.criteria); text(complete.title); commentPrompts(complete.commentPrompts); signatureLabels(complete.signatureLabels);
    return complete;
  });
}
