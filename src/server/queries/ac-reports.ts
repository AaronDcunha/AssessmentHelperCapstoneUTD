import type { Prisma } from "../../generated/prisma/client";
import { ConfigurationError, invalid, pagination, uuid, type ConfigurationUser } from "../configuration-validation";

export type ReportView = "reports" | "attention" | "faculty-status" | "observations" | "metrics";
export type ObservationView = "details" | "template" | "assessment";
export type Connection = Pick<Prisma.TransactionClient, "evaluationCycle" | "observation" | "professor" | "hiringLevel">;
export const eligibilityReason = "Needs review: the first required evaluation date or necessary semester/history data is not established.";
const cancelled = ["CANCELLED", "CANCELED"];
const personSelect = { userId: true, fullName: true };
const observationInclude = {
  signup: { include: { professor: { include: { user: { select: personSelect } } },
    section: { include: { course: true, semester: true, classMeetings: { orderBy: { meetingId: "asc" as const } } } } } },
  observer: { include: { user: { select: personSelect } } },
  signedAssessment: { select: { assessmentId: true, templateId: true, isLocked: true } },
};
type Observation = Prisma.ObservationGetPayload<{ include: typeof observationInclude }>;
const person = (p: { user: { userId: string; fullName: string } }) => ({ id: p.user.userId, name: p.user.fullName });
function page<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit), hasMore = rows.length > limit;
  return { items, pageInfo: { nextCursor: hasMore ? items.at(-1)!.id : null, hasMore } };
}
function filter(url: URL, name: string) { const v = url.searchParams.get(name); return v === "all" || v === "" ? null : v; }
function ids(url: URL) {
  return Object.fromEntries(["departmentId", "hiringLevelId", "observeeId", "observerId"].map(key => {
    const v = filter(url, key); return [key, v === null ? null : uuid(v)];
  }));
}
function search(url: URL) {
  const q = filter(url, "q")?.trim();
  if (q && q.length > 200) invalid("Search is limited to 200 characters.");
  return q;
}
function outstanding(now: Date): Prisma.ObservationWhereInput {
  return { status: { notIn: cancelled }, observerId: { not: null },
    OR: [{ scheduledAt: { lte: now } }, { completedAt: { not: null } }],
    AND: [{ OR: [{ signedAssessment: { is: null } }, { signedAssessment: { is: { isLocked: false } } }] }] };
}
const unmatched: Prisma.ObservationWhereInput = { status: { notIn: cancelled }, observerId: null, completedAt: null };
export function observationWhere(url: URL, cycleId: string, now: Date): Prisma.ObservationWhereInput {
  const id = ids(url), q = search(url), status = filter(url, "status"), assessment = filter(url, "assessmentStatus");
  const clauses: Prisma.ObservationWhereInput[] = [{ cycleId,
    signup: { professor: { ...(id.departmentId ? { departmentId: id.departmentId } : {}),
      ...(id.hiringLevelId ? { hiringLevelId: id.hiringLevelId } : {}),
      ...(id.observeeId ? { professorId: id.observeeId } : {}) } }, ...(id.observerId ? { observerId: id.observerId } : {}) }];
  if (q) clauses.push({ OR: [{ signup: { professor: { user: { fullName: { contains: q, mode: "insensitive" } } } } },
    { observer: { user: { fullName: { contains: q, mode: "insensitive" } } } },
    { signup: { section: { course: { courseCode: { contains: q, mode: "insensitive" } } } } },
    { signup: { section: { sectionCode: { contains: q, mode: "insensitive" } } } }] });
  if (status) {
    const statuses: Record<string, Prisma.ObservationWhereInput> = {
      "in-progress": { status: { notIn: cancelled }, completedAt: null, observerId: { not: null } },
      complete: { completedAt: { not: null } }, incomplete: outstanding(now), unmatched,
    };
    if (statuses[status]) clauses.push(statuses[status]);
    else if (/^[A-Z][A-Z_]{0,49}$/.test(status)) clauses.push({ status });
    else invalid("Invalid observation status.");
  }
  if (assessment) {
    const states: Record<string, Prisma.ObservationWhereInput> = {
      NOT_STARTED: { signedAssessment: { is: null } }, IN_PROGRESS: { signedAssessment: { is: { isLocked: false } } },
      COMPLETED: { signedAssessment: { is: { isLocked: true } } },
    };
    const state = states[assessment.toUpperCase()]; if (!state) invalid("Invalid assessment status."); clauses.push(state);
  }
  return { AND: clauses };
}
function observationResponse(o: Observation, user: ConfigurationUser) {
  const s = o.signup.section, assessment = o.signedAssessment;
  return { id: o.observationId, cycleId: o.cycleId, signupId: o.signupId,
    section: { id: s.sectionId, sectionNumber: s.sectionCode, semester: { id: s.semester.semesterId, name: s.semester.termName },
      course: { id: s.course.courseId, code: s.course.courseCode, title: s.course.courseTitle, departmentId: s.course.departmentId, level: s.course.courseLevel } },
    observee: person(o.signup.professor), observer: o.observer ? person(o.observer) : null,
    status: o.status, scheduledAt: o.scheduledAt, completedAt: o.completedAt,
    assessmentStatus: !assessment ? "NOT_STARTED" : assessment.isLocked ? "COMPLETED" : "IN_PROGRESS",
    participation: [o.signup.professor.userId === user.id ? "observee" : null, o.observer?.userId === user.id ? "observer" : null].filter(Boolean),
    allowedActions: ["view"],
  };
}

function termOrder(code: string) {
  const match = /^(\d{2})([suf])$/.exec(code);
  return match ? Number(match[1]) * 10 + { s: 1, u: 2, f: 3 }[match[2] as "s" | "u" | "f"] : null;
}

export async function facultyStatuses(db: Connection, url: URL, cycle: Prisma.EvaluationCycleGetPayload<{ include: { semester: true } }>) {
  const id = ids(url), q = search(url), signedUp = filter(url, "signedUp");
  if (signedUp !== null && !["true", "false"].includes(signedUp)) invalid("signedUp must be true or false.");
  const include = { user: { select: personSelect }, hiringLevel: true,
    evaluationSignups: { include: { cycle: { include: { semester: true } }, observations: {
      where: { status: { notIn: cancelled } }, select: { observationId: true, completedAt: true },
      orderBy: [{ completedAt: "desc" as const }, { observationId: "asc" as const }] } } } };
  const rows: Prisma.ProfessorGetPayload<{ include: typeof include }>[] = [];
  let cursor: string | undefined;
  // Scan in bounded batches; computed statuses must be filtered before pagination.
  for (;;) {
    const batch = await db.professor.findMany({ where: {
      user: { isActive: true, ...(q ? { fullName: { contains: q, mode: "insensitive" as const } } : {}) },
      ...(id.departmentId ? { departmentId: id.departmentId } : {}), ...(id.hiringLevelId ? { hiringLevelId: id.hiringLevelId } : {}),
      ...(id.observeeId ? { professorId: id.observeeId } : cursor ? { professorId: { gt: cursor } } : {}),
      ...(id.observeeId && cursor ? { AND: [{ professorId: { gt: cursor } }] } : {}),
      ...(signedUp ? { evaluationSignups: { [signedUp === "true" ? "some" : "none"]: { cycleId: cycle.cycleId } } } : {}),
    }, include, orderBy: { professorId: "asc" }, take: 200 });
    rows.push(...batch);
    if (batch.length < 200) break;
    cursor = batch.at(-1)!.professorId;
  }
  const target = termOrder(cycle.semester.termCode);
  return rows.map(p => {
    const signup = p.evaluationSignups.find(s => s.cycleId === cycle.cycleId);
    const history = p.evaluationSignups.flatMap(s => {
      const order = termOrder(s.cycle.semester.termCode);
      return target !== null && order !== null && order <= target ? s.observations.filter(o => o.completedAt).map(o => ({
        order, semester: { id: s.cycle.semesterId, name: s.cycle.semester.termName }, completedAt: o.completedAt!,
      })) : [];
    }).sort((a, b) => b.order - a.order || b.completedAt.getTime() - a.completedAt.getTime());
    const last = history[0], previous = history.find(h => h.order !== target);
    const interval = p.hiringLevel.evaluationIntervalYears;
    let evaluationStatus = "needs-review";
    const { startsOn, endsOn } = cycle.semester;
    if (p.hireDate && endsOn && p.hireDate > endsOn) evaluationStatus = "not_due";
    else if (p.hireDate && startsOn && endsOn && p.hireDate >= startsOn && p.hireDate <= endsOn) evaluationStatus = "not_due";
    else if (last && target !== null && interval > 0) {
      const dueYear = Math.floor(last.order / 10) + interval, year = Math.floor(target / 10);
      // Annual evaluations may occur in either Spring or Fall of the due year.
      if (year < dueYear) evaluationStatus = "not_due";
      else if (year > dueYear) evaluationStatus = "overdue";
      else if (interval === 1) evaluationStatus = "due";
      else if (target % 10 === 2 || last.order % 10 === 2) evaluationStatus = "needs-review";
      else evaluationStatus = target % 10 < last.order % 10 ? "not_due" : target % 10 === last.order % 10 ? "due" : "overdue";
    }
    return { id: p.professorId, professor: person(p), hiringLevel: { id: p.hiringLevelId, name: p.hiringLevel.levelName },
      lastEvaluation: previous ? { semester: previous.semester, completedAt: previous.completedAt } : null,
      evaluationStatus, signupId: signup?.signupId ?? null, observationId: signup?.observations[0]?.observationId ?? null,
      ...(evaluationStatus === "needs-review" ? { unavailableReason: eligibilityReason } : {}) };
  });
}

export async function getCycleReport(db: Connection, user: ConfigurationUser, url: URL, cycleId: string, view: ReportView) {
  const permission = view === "metrics" ? "metrics.read" : view === "observations" ? "observations.read" : "reports.read";
  if (!user.permissions.includes(permission)) throw new ConfigurationError(403, "FORBIDDEN", "Permission denied.");
  const cycle = await db.evaluationCycle.findUnique({ where: { cycleId: uuid(cycleId) }, include: { semester: true } });
  if (!cycle) throw new ConfigurationError(404, "NOT_FOUND", "Evaluation cycle not found.");
  const { limit, cursor } = pagination(url), now = new Date(), id = ids(url);
  const where = observationWhere(url, cycleId, now);
  if (view === "observations") {
    const rows = await db.observation.findMany({ where: { AND: [where, ...(cursor ? [{ observationId: { gt: cursor } }] : [])] },
      include: observationInclude, orderBy: { observationId: "asc" }, take: limit + 1 });
    return page(rows.map(o => observationResponse(o, user)), limit);
  }
  if (view === "faculty-status") {
    const status = filter(url, "evaluationStatus")?.toLowerCase();
    if (status && !["due", "overdue", "not_due", "needs-review", "unavailable"].includes(status)) invalid("Invalid evaluation status.");
    const rows = await facultyStatuses(db, url, cycle);
    return page(rows.filter(p => (!cursor || p.id > cursor) && (!status || p.evaluationStatus === (status === "unavailable" ? "needs-review" : status))), limit);
  }
  if (view === "metrics") {
    const demo = process.env.NODE_ENV === "development";
    return { cycleId, available: demo, source: demo ? "demo" : "unavailable",
      availableAt: demo ? null : cycle.feedbackDeadline, generatedAt: now, formulaVersion: demo ? "demo" : null,
      metrics: [["evaluationEligibilityAccuracy", "Evaluation eligibility accuracy", "percent"], ["overdueEvaluationCount", "Overdue evaluations", "count"],
        ["assessmentParticipationRate", "Participation rate", "percent"], ["observerUtilizationRate", "Observer utilization", "percent"],
        ["listSufficiencyRate", "List sufficiency", "percent"], ["missingObservationCount", "Missing observations", "count"],
        ["surveyCompletionRate", "Survey completion", "percent"]].map(([key, label, unit], index) => ({ key, label, unit,
          value: demo ? [100, 4, 75, 60, 80, 2, 70][index] : null,
          ...(demo ? { source: "demo" } : { unavailableReason: "KPI formulas and denominators require agreement; final KPIs follow the feedback deadline." }) })) };
  }
  if (view === "attention") {
    const issue = filter(url, "issue");
    if (issue && !["overdue", "unmatched", "incomplete", "alert", "expiredApproval"].includes(issue)) invalid("Invalid attention issue.");
    if (issue && ["alert", "expiredApproval"].includes(issue)) return { ...page([], limit), unavailableReason: "This workflow is not represented in the current schema." };
    const rows = issue === "overdue" ? [] : await db.observation.findMany({ where: { AND: [where, issue === "unmatched" ? unmatched : issue === "incomplete" ? outstanding(now) : { OR: [unmatched, outstanding(now)] },
      ...(cursor ? [{ observationId: { gt: cursor } }] : [])] }, include: observationInclude, orderBy: { observationId: "asc" }, take: limit + 1 });
    const overdue = !issue || issue === "overdue" ? (await facultyStatuses(db, url, cycle)).filter(p => p.evaluationStatus === "overdue" && (!cursor || p.id > cursor)) : [];
    const items = [...rows.map(o => ({ id: o.observationId, faculty: person(o.signup.professor),
      issue: o.observerId === null ? "unmatched" : "incomplete", observationStatus: o.status,
      observationId: o.observationId, createdAt: o.signup.signupDate, allowedActions: ["view"] })),
      ...overdue.map(p => ({ id: p.id, faculty: p.professor, issue: "overdue", observationStatus: null,
        observationId: p.observationId, createdAt: null, allowedActions: p.observationId ? ["view"] : [] }))];
    return { ...page(items.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), limit),
      unavailableIssues: ["alert", "expiredApproval"] };
  }
  const faculty = await facultyStatuses(db, url, cycle);
  const levels = await db.hiringLevel.findMany({ where: id.hiringLevelId ? { hiringLevelId: id.hiringLevelId } : {}, orderBy: { levelName: "asc" } });
  const [unmatchedCount, incomplete, byHiringLevel] = await Promise.all([
    db.observation.count({ where: { AND: [where, unmatched] } }), db.observation.count({ where: { AND: [where, outstanding(now)] } }),
    Promise.all(levels.map(async h => ({ hiringLevelId: h.hiringLevelId, name: h.levelName,
      due: faculty.filter(p => p.hiringLevel.id === h.hiringLevelId && p.evaluationStatus === "due").length,
      needsReview: faculty.filter(p => p.hiringLevel.id === h.hiringLevelId && p.evaluationStatus === "needs-review").length,
      outstanding: await db.observation.count({ where: { AND: [where, outstanding(now), { signup: { professor: { hiringLevelId: h.hiringLevelId } } }] } }) }))),
  ]);
  return { cycleId, asOf: now, definitionsVersion: "operational-v2", summary: {
    facultyDue: faculty.filter(p => p.evaluationStatus === "due").length, overdue: faculty.filter(p => p.evaluationStatus === "overdue").length,
    needsReview: faculty.filter(p => p.evaluationStatus === "needs-review").length, unmatched: unmatchedCount, incomplete },
    byHiringLevel, availableViews: ["faculty-status", "attention", "observations"],
    definitions: { unmatched: "Unfinished, non-cancelled observations without a selected observer.",
      eligibility: "Current hiring-level interval and completed evaluation terms; annual due year allows Spring or Fall. Unresolved first-due and summer boundaries need review.",
      incomplete: "Scheduled/past, non-cancelled observations with an observer and no locked assessment; this does not establish non-occurrence." } };
}

// Convert a stored schedule's local wall time using its semester's IANA zone.
function meetingTime(date: string, time: string, zone: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const desired = Date.parse(`${date}T${time}:00Z`); let value = desired;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const wall = (instant: number) => { const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`); };
  for (let i = 0; i < 3; i++) value += desired - wall(value);
  return wall(value) === desired ? new Date(value).toISOString() : null;
}
function meetings(o: Observation, dates: { timeOptionId: string; preferredDate: Date }[]) {
  const section = o.signup.section, zone = section.semester.timeZone;
  return dates.flatMap(option => {
    const date = option.preferredDate.toISOString().slice(0, 10);
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(option.preferredDate);
    return section.classMeetings.filter(m => m.dayOfWeek === weekday).flatMap(m => {
      const startsAt = meetingTime(date, m.startTime, zone), endsAt = meetingTime(date, m.endTime, zone);
      return startsAt && endsAt ? [{ id: `${option.timeOptionId}:${m.meetingId}`, sectionId: section.sectionId, date, startsAt, endsAt, timeZone: zone, location: m.location }] : [];
    });
  });
}
export async function getObservation(db: Connection, user: ConfigurationUser, observationId: string, view: ObservationView) {
  const broad = user.permissions.includes(view === "details" ? "observations.read" : "assessments.read");
  const own = user.permissions.includes(view === "details" ? "observations.read.own" : "assessment.read.own");
  if (!broad && !own) throw new ConfigurationError(403, "FORBIDDEN", "Permission denied.");
  const o = await db.observation.findFirst({ where: { observationId: uuid(observationId),
    ...(broad ? {} : { OR: [{ signup: { professor: { userId: user.id } } }, { observer: { userId: user.id } }] }) },
    include: { ...observationInclude, timeOptions: { orderBy: { preferredDate: "asc" } },
      facultyIssues: { where: { kind: "ALERT", status: { not: "RESOLVED" } }, select: { issueId: true }, orderBy: { createdAt: "desc" }, take: 1 },
      signedAssessment: { include: { template: { include: { criteria: { orderBy: { displayOrder: "asc" } } } } } } } });
  if (!o) throw new ConfigurationError(404, "NOT_FOUND", "Observation not found.");
  const a = o.signedAssessment;
  if (view === "details") {
    const proposed = meetings(o, o.timeOptions);
    const scheduled = o.scheduledAt ? proposed.find(m => m.startsAt === o.scheduledAt!.toISOString()) ?? null : null;
    return { observation: { ...observationResponse(o, user), scheduledMeeting: scheduled }, proposedMeetings: proposed,
      pendingAlert: (broad || o.signup.professor.userId === user.id) && o.facultyIssues.length ? { id: o.facultyIssues[0].issueId } : null,
      progress: [{ key: "signup", label: "Signed up", state: "completed", completedAt: o.signup.signupDate },
        { key: "observer", label: "Observer selected", state: o.observerId ? "completed" : "pending", completedAt: null },
        { key: "scheduled", label: "Observation scheduled", state: o.scheduledAt ? "completed" : "pending", completedAt: null },
        { key: "observation", label: "Observation completed", state: o.completedAt ? "completed" : "pending", completedAt: o.completedAt },
        { key: "assessment", label: "Assessment locked", state: a?.isLocked ? "completed" : "pending", completedAt: a?.isLocked ? a.completedAt : null }],
      templateVersionId: a?.templateId ?? null,
      ...(o.scheduledAt && !scheduled ? { unavailableReason: "The stored appointment cannot be matched to a proposed class meeting." } : {}) };
  }
  if (view === "template") {
    if (!a) throw new ConfigurationError(404, "NOT_FOUND", "No template is assigned to this observation.");
    const t = a.template;
    return { id: t.templateId, title: t.templateName, revision: t.revision, criteria: t.criteria.map(c => ({ id: c.criterionId, key: c.criterionKey,
      prompt: c.criterionText, type: c.questionType.toLowerCase(), required: c.isRequired, order: c.displayOrder, weight: c.weight,
      ...(c.options === null ? {} : { options: c.options }) })), commentPrompts: t.commentPrompts, signatureLabels: t.signatureLabels };
  }
  if (!a) return { observationId, assessment: null, allowedActions: [] };
  if (!a.isLocked && o.observer?.userId !== user.id) throw new ConfigurationError(403, "DRAFT_PRIVATE", "Unfinalized assessment visibility requires team agreement.");
  // Keep the read contract while accepting the Faculty writer's ID-keyed objects.
  const stored = a.responses as Record<string, unknown> | null;
  const keyed = stored && !Array.isArray(stored) && typeof stored.answers === "object" && stored.answers !== null && !Array.isArray(stored.answers)
    && typeof stored.comments === "string" && Object.keys(stored).every(k => ["answers", "comments", "promptAnswers"].includes(k));
  if (keyed && stored.promptAnswers !== undefined && (!stored.promptAnswers || typeof stored.promptAnswers !== "object" || Array.isArray(stored.promptAnswers))) {
    throw new ConfigurationError(409, "ASSESSMENT_FORMAT", "Stored assessment comments require review.");
  }
  const responses = (keyed ? {
    answers: Object.entries(stored.answers as Record<string, unknown>).map(([criterionId, value]) => ({ criterionId, value })),
    comments: Object.entries(stored.promptAnswers ?? {}).map(([promptId, text]) => ({ promptId, text })),
  } : stored) as { answers?: { criterionId: string; value: number | string | null }[]; comments?: { promptId: string; text: string }[] };
  const answers = responses?.answers ?? [], comments = responses?.comments ?? [];
  if (!responses || Array.isArray(responses) || typeof responses !== "object" || Object.keys(responses).some(k => !["answers", "comments"].includes(k)) ||
    !Array.isArray(answers) || !Array.isArray(comments) ||
    answers.some(x => !x || typeof x.criterionId !== "string" || !a.template.criteria.some(c => c.criterionId === x.criterionId) || (x.value !== null && !["number", "string"].includes(typeof x.value))) ||
    comments.some(x => !x || typeof x.promptId !== "string" || typeof x.text !== "string") ||
    new Set(answers.map(x => x.criterionId)).size !== answers.length || new Set(comments.map(x => x.promptId)).size !== comments.length) {
    throw new ConfigurationError(409, "ASSESSMENT_FORMAT", "Stored assessment answers do not match the agreed response contract.");
  }
  return { observationId, templateVersionId: a.templateId, assessment: { id: a.assessmentId, observationId, templateVersionId: a.templateId,
    status: a.isLocked ? "locked" : a.observerSignedAt ? "submitted" : "draft", revision: null,
    answers: answers.map(x => ({ criterionId: x.criterionId, value: x.value })),
    comments: comments.map(x => ({ promptId: x.promptId, text: x.text })), generalComments: keyed ? stored.comments : null, submittedAt: null,
    acknowledgements: [a.observerSignedAt && o.observer ? { actorId: o.observer.userId, participantRole: "observer", acknowledgedAt: a.observerSignedAt } : null,
      a.observeeSignedAt ? { actorId: o.signup.professor.userId, participantRole: "observee", acknowledgedAt: a.observeeSignedAt } : null].filter(Boolean),
    allowedActions: [], unavailableReason: "Assessment revisions and submission timestamps are not stored in the current schema." }, allowedActions: [] };
}
