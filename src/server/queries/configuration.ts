import type { Prisma, Semester, ObservationTemplate, TemplateCriterion } from "../../generated/prisma/client";
import { ConfigurationError, hasAnyPermission, invalid, pagination, uuid, type ConfigurationUser } from "../configuration-validation";

export type Connection = Pick<Prisma.TransactionClient, "semester" | "evaluationCycle" | "observationTemplate" | "templateCriterion" | "signedAssessment">;
export function authorize(user: ConfigurationUser, permissions: string[]) {
  if (!hasAnyPermission(user, permissions)) throw new ConfigurationError(403, "FORBIDDEN", "Permission denied.");
}
export const cycleReadPermissions = ["cycles.read", "cycles.manage", "course-sections.read.own", "signups.read.own", "observations.read.own"];
export const templateReadPermissions = ["templates.read", "templates.manage", "assessment.read.own"];
const managesCycles = (user: ConfigurationUser) => hasAnyPermission(user, ["cycles.read", "cycles.manage"]);
const managesTemplates = (user: ConfigurationUser) => hasAnyPermission(user, ["templates.read", "templates.manage"]);

function relevantSemester(userId: string): Prisma.SemesterWhereInput {
  return { courseSections: { some: { teaches: { some: { professor: { userId } } } } } };
}
function cycleScope(user: ConfigurationUser): Prisma.EvaluationCycleWhereInput {
  if (managesCycles(user)) return {};
  return { OR: [
    { semester: relevantSemester(user.id) },
    { signups: { some: { professor: { userId: user.id } } } },
    { observations: { some: { observer: { userId: user.id } } } },
    { observations: { some: { currentReleasedList: { is: { publishedAt: { not: null }, candidates: { some: { professor: { userId: user.id } } } } } } } },
  ] };
}

/** Faculty dashboards always use own participation, even for AC/Admin callers.
 * Reuse the same scope for the explicit Faculty cycle selector.
 */
export async function getRelevantFacultyCycles(db: Connection, user: ConfigurationUser, now: Date) {
  const ownUser = { ...user, permissions: user.permissions.filter(key => key !== "cycles.read" && key !== "cycles.manage") };
  if (!hasAnyPermission(ownUser, cycleReadPermissions)) return [];
  return db.evaluationCycle.findMany({
    where: { AND: [cycleScope(ownUser), { feedbackDeadline: { gte: now } }] },
    include: { semester: true }, orderBy: { cycleId: "asc" },
  });
}
export function semesterResponse(s: Semester) {
  const term = /^(\d{2})([suf])$/.exec(s.termCode);
  return { id: s.semesterId, name: s.termName, year: term ? 2000 + Number(term[1]) : null,
    season: term ? ({ s: "Spring", u: "Summer", f: "Fall" }[term[2]]) : null,
    startsOn: s.startsOn?.toISOString().slice(0, 10) ?? null, endsOn: s.endsOn?.toISOString().slice(0, 10) ?? null,
    timeZone: s.timeZone, revision: s.revision };
}
type CycleWithSemester = Prisma.EvaluationCycleGetPayload<{ include: { semester: true } }>;
function cycleResponse(c: CycleWithSemester, user: ConfigurationUser, now: Date) {
  const status = now <= c.signupDeadline ? "signup" : now <= c.observationDeadline ? "observation" : now <= c.feedbackDeadline ? "feedback" : "closed";
  return { id: c.cycleId, semester: semesterResponse(c.semester), signupDeadline: c.signupDeadline.toISOString(),
    observationDeadline: c.observationDeadline.toISOString(), feedbackDeadline: c.feedbackDeadline.toISOString(),
    revision: c.revision, status, allowedActions: user.permissions.includes("cycles.manage") ? ["update", "updateSettings"] : [] };
}
function list<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, pageInfo: { nextCursor: hasMore ? items.at(-1)!.id : null, hasMore } };
}
export async function getCycle(db: Connection, user: ConfigurationUser, id: string) {
  authorize(user, cycleReadPermissions);
  const cycle = await db.evaluationCycle.findFirst({ where: { AND: [{ cycleId: uuid(id) }, cycleScope(user)] }, include: { semester: true } });
  if (!cycle) throw new ConfigurationError(404, "NOT_FOUND", "Evaluation cycle not found.");
  return cycleResponse(cycle, user, new Date());
}
export async function getCycles(db: Connection, user: ConfigurationUser, url: URL) {
  authorize(user, cycleReadPermissions);
  const { limit, cursor } = pagination(url);
  const semesterId = url.searchParams.get("semesterId"), status = url.searchParams.get("status");
  if (semesterId !== null) uuid(semesterId);
  if (status !== null && !["signup", "observation", "feedback", "closed"].includes(status)) invalid("Invalid cycle status.");
  const now = new Date();
  const statuses: Record<string, Prisma.EvaluationCycleWhereInput> = {
    signup: { signupDeadline: { gte: now } },
    observation: { signupDeadline: { lt: now }, observationDeadline: { gte: now } },
    feedback: { signupDeadline: { lt: now }, observationDeadline: { lt: now }, feedbackDeadline: { gte: now } },
    closed: { signupDeadline: { lt: now }, observationDeadline: { lt: now }, feedbackDeadline: { lt: now } },
  };
  const rows = await db.evaluationCycle.findMany({
    where: { AND: [cycleScope(user), ...(status ? [statuses[status]] : [])],
      ...(semesterId ? { semesterId } : {}), ...(cursor ? { cycleId: { gt: cursor } } : {}) },
    include: { semester: true }, orderBy: { cycleId: "asc" }, take: limit + 1,
  });
  return list(rows.map(row => cycleResponse(row, user, now)), limit);
}
export async function getSemesters(db: Connection, user: ConfigurationUser, url: URL) {
  authorize(user, cycleReadPermissions);
  const { limit, cursor } = pagination(url);
  const year = url.searchParams.get("year"), season = url.searchParams.get("season");
  if (year !== null && !/^20\d{2}$/.test(year)) invalid("year must be between 2000 and 2099.");
  if (season !== null && !["Spring", "Summer", "Fall"].includes(season)) invalid("season must be Spring, Summer or Fall.");
  const rows = await db.semester.findMany({
    where: { AND: [managesCycles(user) ? {} : relevantSemester(user.id),
      ...(year ? [{ termCode: { startsWith: year.slice(2) } }] : []),
      ...(season ? [{ termCode: { endsWith: { Spring: "s", Summer: "u", Fall: "f" }[season] } }] : [])],
      ...(cursor ? { semesterId: { gt: cursor } } : {}) },
    orderBy: { semesterId: "asc" }, take: limit + 1,
  });
  return list(rows.map(semesterResponse), limit);
}
function templateSummary(t: Pick<ObservationTemplate, "templateId" | "templateName" | "status" | "publishedAt" | "revision">) {
  return { id: t.templateId, title: t.templateName, status: t.status, publishedAt: t.publishedAt?.toISOString() ?? null, revision: t.revision };
}
function templateResponse(t: ObservationTemplate & { criteria: TemplateCriterion[] }) {
  return { ...templateSummary(t), commentPrompts: t.commentPrompts, signatureLabels: t.signatureLabels,
    criteria: t.criteria.map(c => ({ id: c.criterionId, key: c.criterionKey, prompt: c.criterionText,
      type: c.questionType.toLowerCase(), required: c.isRequired, order: c.displayOrder, weight: c.weight,
      ...(c.options === null ? {} : { options: c.options }) })) };
}
export async function getTemplate(db: Connection, user: ConfigurationUser, id: string) {
  authorize(user, templateReadPermissions);
  const template = await db.observationTemplate.findFirst({
    where: { templateId: uuid(id), ...(managesTemplates(user) ? {} : { status: "published" }) },
    include: { criteria: { orderBy: { displayOrder: "asc" } } },
  });
  if (!template) throw new ConfigurationError(404, "NOT_FOUND", "Observation template not found.");
  return templateResponse(template);
}
export async function getTemplates(db: Connection, user: ConfigurationUser, url: URL) {
  authorize(user, templateReadPermissions);
  const { limit, cursor } = pagination(url), status = url.searchParams.get("status");
  if (status !== null && !["draft", "published"].includes(status)) invalid("Invalid template status.");
  const rows = await db.observationTemplate.findMany({
    where: { AND: [managesTemplates(user) ? {} : { status: "published" }, ...(status ? [{ status }] : [])],
      ...(cursor ? { templateId: { gt: cursor } } : {}) },
    select: { templateId: true, templateName: true, status: true, publishedAt: true, revision: true },
    orderBy: { templateId: "asc" }, take: limit + 1,
  });
  return list(rows.map(templateSummary), limit);
}
export async function getCurrentTemplate(db: Connection, user: ConfigurationUser, url: URL) {
  authorize(user, templateReadPermissions);
  if (url.searchParams.has("cycleId")) invalid("Templates are university-wide; cycleId applicability is not supported.");
  const template = await db.observationTemplate.findFirst({ where: { status: "published", isActive: true },
    orderBy: [{ publishedAt: "desc" }, { templateId: "desc" }], include: { criteria: { orderBy: { displayOrder: "asc" } } } });
  if (!template) throw new ConfigurationError(404, "NOT_FOUND", "No published template is available.");
  return templateResponse(template);
}
