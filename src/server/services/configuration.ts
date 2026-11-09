import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { ConfigurationError, commentPrompts, criteria, date, deadlines, fields, invalid, object, revision,
  signatureLabels, text, timeZone, uuid, type ConfigurationUser } from "../configuration-validation";
import { authorize, getCycle, getTemplate } from "../queries/configuration";
import { createTemplateSnapshot } from "../template-snapshot";

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
  fields(body, ["semesterId", "signupDeadline", "observationDeadline", "feedbackDeadline", "semester", "expectedSemesterRevision", "creationId"]);
  const semesterId = uuid(body.semesterId), d = deadlines(body);
  const creationId = body.creationId === undefined ? undefined : uuid(body.creationId);
  const settings = body.semester === undefined ? undefined : object(body.semester);
  if (settings) fields(settings, ["startsOn", "endsOn", "timeZone"]);
  const startsOn = settings ? date(settings.startsOn) : undefined, endsOn = settings ? date(settings.endsOn) : undefined;
  if (startsOn && endsOn && startsOn > endsOn) invalid("Semester start must be on or before its end.");
  const zone = settings ? timeZone(settings.timeZone) : undefined;
  const expected = settings ? revision(body.expectedSemesterRevision) : undefined;
  return prisma.$transaction(async db => {
    const semester = await db.semester.findUnique({ where: { semesterId } });
    if (!semester) missing("Semester not found.");
    if (creationId) {
      const existing = await db.evaluationCycle.findUnique({ where: { cycleId: creationId } });
      if (existing) {
        if (existing.semesterId !== semesterId || existing.signupDeadline.getTime() !== Date.parse(d.signupDeadline) || existing.observationDeadline.getTime() !== Date.parse(d.observationDeadline) || existing.feedbackDeadline.getTime() !== Date.parse(d.feedbackDeadline) || (settings && (semester.startsOn?.toISOString().slice(0, 10) !== startsOn || semester.endsOn?.toISOString().slice(0, 10) !== endsOn || semester.timeZone !== zone)))
          throw new ConfigurationError(409, "CREATION_KEY_REUSED", "Creation ID belongs to different settings. Reload before continuing.");
        return getCycle(db, user, existing.cycleId);
      }
    }
    if (settings) {
      const updated = await db.semester.updateMany({ where: { semesterId, revision: expected }, data: { startsOn: new Date(startsOn!), endsOn: new Date(endsOn!), timeZone: zone, revision: { increment: 1 } } });
      if (!updated.count) stale();
    }
    const cycle = await db.evaluationCycle.create({ data: { ...(creationId ? { cycleId: creationId } : {}), semesterId, cycleName: semester.termName, ...deadlineData(d) } });
    return getCycle(db, user, cycle.cycleId);
  }, { isolationLevel: "Serializable" });
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
  fields(body, ["title", "criteria", "commentPrompts", "signatureLabels", ...(update ? ["expectedRevision", "confirmImpact"] : [])]);
  if (!update || body.title !== undefined) body.title = text(body.title);
  if (!update || body.criteria !== undefined) body.criteria = criteria(body.criteria);
  if (body.commentPrompts !== undefined) body.commentPrompts = commentPrompts(body.commentPrompts).map(prompt => ({ ...prompt, id: prompt.id ?? randomUUID() }));
  if (body.signatureLabels !== undefined) body.signatureLabels = signatureLabels(body.signatureLabels);
  if (update && body.confirmImpact !== undefined && typeof body.confirmImpact !== "boolean") invalid("confirmImpact must be true or false.");
  if (update && !Object.keys(body).some(key => !["expectedRevision", "confirmImpact"].includes(key))) invalid("Provide at least one template field to update.");
  return body;
}
export async function createTemplate(prisma: PrismaClient, user: ConfigurationUser, input: unknown) {
  authorize(user, ["templates.manage"]);
  const { creationKey: suppliedKey, ...payload } = object(input);
  const creationKey = suppliedKey === undefined ? undefined : uuid(suppliedKey).toLowerCase();
  const body = validateTemplate(payload, false);
  // Bind the key to the creator and original request, independently of JSON field
  // order. Hash before generated criterion/comment IDs enter the persisted record.
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
  const creationHash = creationKey ? createHash("sha256").update(JSON.stringify(canonical({ userId: user.id, payload }))).digest("hex") : undefined;
  async function replay(db: Prisma.TransactionClient) {
    const existing = await db.observationTemplate.findUnique({ where: { creationKey: creationKey! }, select: { templateId: true, creationHash: true } });
    if (!existing) return null;
    if (existing.creationHash !== creationHash) throw new ConfigurationError(409, "CREATION_KEY_REUSED", "This creation key belongs to a different request. Retry the original request or start a new template.");
    return getTemplate(db, user, existing.templateId);
  }
  try { return await prisma.$transaction(async db => {
    if (creationKey) { const existing = await replay(db); if (existing) return existing; }
    const template = await db.observationTemplate.create({ data: { ...(creationKey ? { creationKey, creationHash } : {}), templateName: body.title as string, isActive: false, status: "draft",
      commentPrompts: (body.commentPrompts ?? []) as Prisma.InputJsonValue,
      signatureLabels: (body.signatureLabels ?? { observer: "Observer", observee: "Observee" }) as Prisma.InputJsonValue } });
    await saveCriteria(db, template.templateId, body.criteria as Questions, new Set());
    return getTemplate(db, user, template.templateId);
  }); } catch (error) {
    // Concurrent attempts can both miss the initial lookup. The unique index
    // resolves that race; read the winner only after the losing transaction ends.
    if (creationKey && error && typeof error === "object" && "code" in error && error.code === "P2002") {
      const existing = await replay(prisma);
      if (existing) return existing;
    }
    throw error;
  }
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
    if (current.status === "archived") throw new ConfigurationError(409, "ARCHIVED_TEMPLATE", "Archived templates are retained for history and cannot be edited.");
    const before = await db.observationTemplate.findUniqueOrThrow({ where: { templateId: id }, include: { criteria: { orderBy: [{ displayOrder: "asc" }, { criterionId: "asc" }] }, assessments: true } });
    const questions = body.criteria as Questions | undefined;
    const nextQuestions = questions?.map(question => ({ ...question, id: question.id ?? randomUUID() }));
    const existingIds = new Set(before.criteria.map(row => row.criterionId));
    for (const question of nextQuestions ?? []) if (question.id && !existingIds.has(question.id) && questions?.some(inputQuestion => inputQuestion.id === question.id)) invalid("Criterion ID does not belong to this template.");
    const targetQuestions = nextQuestions ?? before.criteria.map(c => ({ id: c.criterionId, key: c.criterionKey, prompt: c.criterionText, type: c.questionType.toLowerCase() as "rating" | "text", required: c.isRequired, order: c.displayOrder, weight: c.weight, options: Array.isArray(c.options) ? c.options as { value: number; label: string }[] : undefined }));
    const targetByKey = new Map(targetQuestions.map(question => [question.key, question]));
    const sourceById = new Map(before.criteria.map(question => [question.criterionId, question]));
    const targetPrompts = (body.commentPrompts ?? before.commentPrompts) as Array<{id?:string;prompt:string;required:boolean;order:number}>;
    const promptIds = new Set(targetPrompts.flatMap(prompt => prompt.id ? [prompt.id] : []));
    const updates: Array<{ assessmentId: string; responses: Prisma.InputJsonValue; archive: Prisma.InputJsonValue }> = [];
    let impact = 0;
    for (const assessment of before.assessments) {
      if (assessment.observerSignedAt || assessment.observeeSignedAt || assessment.isLocked) {
        if (!assessment.templateSnapshot) await db.signedAssessment.update({ where: { assessmentId: assessment.assessmentId }, data: { templateSnapshot: createTemplateSnapshot(before) as Prisma.InputJsonValue } });
        continue;
      }
      const responses = assessment.responses as {answers?:Record<string,string|number>;comments?:string;promptAnswers?:Record<string,string>};
      if (!responses || typeof responses !== "object" || !responses.answers || typeof responses.answers !== "object") throw new ConfigurationError(409, "ASSESSMENT_FORMAT", "A saved draft requires manual review before this template can be edited.");
      const answers: Record<string,string|number> = {}, promptAnswers: Record<string,string> = {};
      const archived: Array<Record<string,unknown>> = [];
      for (const [sourceId, answer] of Object.entries(responses.answers)) {
        const source = sourceById.get(sourceId), target = source ? targetByKey.get(source.criterionKey) : undefined;
        const type = target?.type.toUpperCase();
        const compatible = target && type === source!.questionType && (type !== "RATING" || target.options?.some(option => option.value === answer));
        if (compatible) answers[target!.id!] = answer;
        else archived.push({ kind: "answer", key: source?.criterionKey ?? sourceId, value: answer, reason: target ? "question type or scale changed" : "question removed" });
      }
      for (const [promptId, answer] of Object.entries(responses.promptAnswers ?? {})) {
        if (promptIds.has(promptId)) promptAnswers[promptId] = answer;
        else archived.push({ kind: "comment", key: promptId, value: answer, reason: "comment prompt removed" });
      }
      impact += archived.length;
      const prior = Array.isArray(assessment.responseArchive) ? assessment.responseArchive : [];
      updates.push({ assessmentId: assessment.assessmentId, responses: { answers, comments: responses.comments ?? "", promptAnswers }, archive: [...prior, ...archived] as Prisma.InputJsonValue });
    }
    if (impact && body.confirmImpact !== true) throw new ConfigurationError(409, "TEMPLATE_IMPACT_CONFIRMATION_REQUIRED", `${impact} saved answer(s) or comment(s) would become incompatible. Confirm to archive them without silent loss.`);
    const result = await db.observationTemplate.updateMany({ where: { templateId: id, revision: current.revision }, data: {
      ...(body.title === undefined ? {} : { templateName: body.title as string }),
      ...(body.commentPrompts === undefined ? {} : { commentPrompts: body.commentPrompts as Prisma.InputJsonValue }),
      ...(body.signatureLabels === undefined ? {} : { signatureLabels: body.signatureLabels as Prisma.InputJsonValue }),
      revision: { increment: 1 },
    } });
    if (!result.count) stale();
    if (nextQuestions !== undefined) await saveCriteria(db, id, nextQuestions, new Set([...existingIds, ...nextQuestions.map(row => row.id!)]));
    for (const update of updates) await db.signedAssessment.update({ where: { assessmentId: update.assessmentId }, data: { responses: update.responses, responseArchive: update.archive } });
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

export async function unarchiveTemplate(prisma: PrismaClient, user: ConfigurationUser, id: string, input: unknown) {
  authorize(user, ["templates.manage"]);
  const body = object(input);
  fields(body, ["expectedRevision"]);
  return prisma.$transaction(async db => {
    const current = await readTemplate(db, id, body.expectedRevision);
    if (current.status !== "archived") throw new ConfigurationError(409, "INVALID_TRANSITION", "Only archived templates can be restored.");
    const result = await db.observationTemplate.updateMany({
      where: { templateId: uuid(id), revision: current.revision, status: "archived" },
      data: { status: "draft", isActive: false, archivedAt: null, revision: { increment: 1 } },
    });
    if (!result.count) stale();
    return getTemplate(db, user, id);
  });
}

export async function deleteTemplate(prisma: PrismaClient, user: ConfigurationUser, id: string, input: unknown) {
  authorize(user, ["templates.manage"]); id = uuid(id);
  const body = object(input); fields(body, ["expectedRevision"]); const expected = revision(body.expectedRevision);
  return prisma.$transaction(async db => {
    const template = await db.observationTemplate.findUnique({ where: { templateId: id }, select: { revision: true, status: true,
      _count: { select: { assessments: true, assignedObservations: true } } } });
    if (!template) missing("Observation template not found.");
    if (template.revision !== expected) stale();
    const used = template.status !== "draft" || template._count.assessments > 0 || template._count.assignedObservations > 0;
    if (used) {
      const changed = await db.observationTemplate.updateMany({ where: { templateId: id, revision: expected }, data: { status: "archived", isActive: false, archivedAt: new Date(), revision: { increment: 1 } } });
      if (!changed.count) stale();
      return { deleted: false, archived: true, templateId: id, revision: expected + 1 };
    }
    await db.templateCriterion.deleteMany({ where: { templateId: id } });
    await db.observationTemplate.delete({ where: { templateId: id } });
    return { deleted: true, archived: false, templateId: id };
  });
}
