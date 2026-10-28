import type { Prisma } from "../../generated/prisma/client";
import { ConfigurationError, type ConfigurationUser } from "../configuration-validation";

export type ObservationDatabase = Pick<Prisma.TransactionClient, "observation">;
const invalid = (message: string): never => { throw new ConfigurationError(400, "INVALID_QUERY", message); };
const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const allowed = new Set(["cycleId", "semesterId", "participation", "status", "assessmentStatus", "cursor", "limit"]);

export function personalObservationFilters(params: URLSearchParams) {
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1 || !params.get(key)?.trim()) invalid("Invalid query parameters.");
  }
  const id = (key: string) => {
    const value = params.get(key);
    if (value !== null && !uuidPattern.test(value)) invalid(`${key} must be a UUID.`);
    return value?.toLowerCase() ?? null;
  };
  const cycleId = id("cycleId"), semesterId = id("semesterId"), cursor = id("cursor");
  const participation = params.get("participation");
  if (participation && !["observer", "observee"].includes(participation)) invalid("Invalid participation.");
  const status = params.get("status");
  // Persisted statuses are strings, not an agreed enum. Match an exact stored value.
  if (status && !/^[A-Z][A-Z_]{0,49}$/.test(status)) invalid("status must be a stored uppercase status.");
  const assessmentStatus = params.get("assessmentStatus")?.toUpperCase() ?? null;
  if (assessmentStatus && !["NOT_STARTED", "IN_PROGRESS", "COMPLETED"].includes(assessmentStatus)) invalid("Invalid assessmentStatus.");
  const rawLimit = params.get("limit") ?? "20";
  if (!/^\d+$/.test(rawLimit) || +rawLimit < 1 || +rawLimit > 100) invalid("limit must be between 1 and 100.");
  return { cycleId, semesterId, cursor, participation, status, assessmentStatus, limit: +rawLimit };
}

const select = {
  observationId: true, cycleId: true, signupId: true, status: true, scheduledAt: true,
  scheduledEndsAt: true, completedAt: true, workflowRevision: true,
  signup: { select: {
    professor: { select: { user: { select: { userId: true, fullName: true } } } },
    section: { select: {
      sectionId: true, sectionCode: true, semesterId: true,
      semester: { select: { semesterId: true, termName: true, timeZone: true } },
      course: { select: { courseId: true, courseCode: true, courseTitle: true, departmentId: true, courseLevel: true } },
      classMeetings: { orderBy: { meetingId: "asc" as const }, select: { meetingId: true, dayOfWeek: true, startTime: true, endTime: true, location: true } },
    } },
  } },
  observer: { select: { user: { select: { userId: true, fullName: true } } } },
  signedAssessment: { select: { isLocked: true } },
  timeOptions: { orderBy: { timeOptionId: "asc" as const }, select: { timeOptionId: true, preferredDate: true, startsAt: true, endsAt: true, timeZone: true, location: true } },
} satisfies Prisma.ObservationSelect;
type Row = Prisma.ObservationGetPayload<{ select: typeof select }>;

function observationResponse(row: Row, user: ConfigurationUser) {
  const section = row.signup.section, course = section.course;
  const person = (p: { user: { userId: string; fullName: string } }) => ({ id: p.user.userId, name: p.user.fullName });
  const scheduled = row.timeOptions.find(option => option.startsAt && option.endsAt && option.timeZone
    && option.startsAt.getTime() === row.scheduledAt?.getTime());
  return {
    id: row.observationId, cycleId: row.cycleId, signupId: row.signupId,
    section: {
      id: section.sectionId, sectionNumber: section.sectionCode, semesterId: section.semesterId,
      semester: { id: section.semester.semesterId, name: section.semester.termName },
      course: { id: course.courseId, code: course.courseCode, title: course.courseTitle, departmentId: course.departmentId, level: course.courseLevel },
      meetings: section.classMeetings.map(m => ({ id: m.meetingId, weekday: m.dayOfWeek,
        startTime: m.startTime, endTime: m.endTime, timeZone: section.semester.timeZone, location: m.location })),
    },
    observee: person(row.signup.professor), observer: row.observer ? person(row.observer) : null,
    participation: [row.signup.professor.user.userId === user.id ? "observee" : null,
      row.observer?.user.userId === user.id ? "observer" : null].filter((role): role is string => role !== null),
    status: row.status,
    assessmentStatus: !row.signedAssessment ? "NOT_STARTED" : row.signedAssessment.isLocked ? "COMPLETED" : "IN_PROGRESS",
    scheduledMeeting: scheduled ? { id: scheduled.timeOptionId, sectionId: section.sectionId,
      date: scheduled.preferredDate.toISOString().slice(0, 10), startsAt: scheduled.startsAt!.toISOString(),
      endsAt: scheduled.endsAt!.toISOString(), timeZone: scheduled.timeZone!, location: scheduled.location } : null,
    // Completion proves occurrence; absence of completion does not prove non-occurrence.
    occurred: row.completedAt ? true : null, revision: row.workflowRevision,
    scheduledAt: row.scheduledAt?.toISOString() ?? null, completedAt: row.completedAt?.toISOString() ?? null,
    allowedActions: ["view"],
    ...(row.scheduledAt && !scheduled ? { unavailableReason: "Stored appointment metadata is incomplete." } : {}),
  };
}

/** Always own records, even when the caller also has university-wide AC/Admin grants. */
export async function getPersonalObservations(db: ObservationDatabase, user: ConfigurationUser, params: URLSearchParams) {
  if (!user.permissions.includes("observations.read.own")) throw new ConfigurationError(403, "FORBIDDEN", "Access denied.");
  const filters = personalObservationFilters(params);
  const empty = { items: [], pageInfo: { hasMore: false, nextCursor: null } };
  // Reserved mock accounts have no database identity. Never generate fake business records.
  if (user.id.startsWith("demo:")) return empty;
  const observee = { signup: { professor: { userId: user.id } } };
  const observer = { observer: { userId: user.id } };
  const clauses: Prisma.ObservationWhereInput[] = [filters.participation === "observee" ? observee
    : filters.participation === "observer" ? observer : { OR: [observee, observer] }];
  if (filters.cycleId) clauses.push({ cycleId: filters.cycleId });
  if (filters.semesterId) clauses.push({ cycle: { semesterId: filters.semesterId } });
  if (filters.status) clauses.push({ status: filters.status });
  if (filters.assessmentStatus === "NOT_STARTED") clauses.push({ signedAssessment: { is: null } });
  if (filters.assessmentStatus === "IN_PROGRESS") clauses.push({ signedAssessment: { is: { isLocked: false } } });
  if (filters.assessmentStatus === "COMPLETED") clauses.push({ signedAssessment: { is: { isLocked: true } } });
  // Validate the cursor under exactly the same ownership and filters; never reveal foreign IDs.
  if (filters.cursor) {
    const anchor = await db.observation.findFirst({ where: { AND: [...clauses, { observationId: filters.cursor }] }, select: { observationId: true } });
    if (!anchor) invalid("Invalid cursor for these observations and filters.");
    clauses.push({ observationId: { gt: filters.cursor } });
  }
  const rows = await db.observation.findMany({ where: { AND: clauses }, select,
    orderBy: { observationId: "asc" }, take: filters.limit + 1 });
  const items = rows.slice(0, filters.limit).map(row => observationResponse(row, user));
  const hasMore = rows.length > filters.limit;
  return { items, pageInfo: { hasMore, nextCursor: hasMore ? items.at(-1)!.id : null } };
}
