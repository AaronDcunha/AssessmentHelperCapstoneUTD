import type { Prisma } from "../../generated/prisma/client";
import { ConfigurationError, pagination, uuid, type ConfigurationUser } from "../configuration-validation";

export type SignupDatabase = Pick<Prisma.TransactionClient, "evaluationCycle" | "evaluationSignup">;
const allowed = new Set(["departmentId", "hiringLevelId", "q", "cursor", "limit"]);
const invalidQuery = (message: string): never => { throw new ConfigurationError(400, "INVALID_QUERY", message); };

function filters(url: URL) {
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1 || !url.searchParams.get(key)?.trim()) {
      invalidQuery("Unknown, repeated or empty query parameter.");
    }
  }
  const identifier = (key: string) => {
    const value = url.searchParams.get(key);
    return value === null ? null : uuid(value).toLowerCase();
  };
  const departmentId = identifier("departmentId"), hiringLevelId = identifier("hiringLevelId");
  const q = url.searchParams.get("q")?.trim();
  if (q && q.length > 200) invalidQuery("Search is limited to 200 characters.");
  const { limit, cursor } = pagination(url);
  return { departmentId, hiringLevelId, q, limit, cursor: cursor?.toLowerCase() ?? null };
}

const select = {
  signupId: true, signupDate: true,
  professor: { select: { user: { select: { userId: true, fullName: true, email: true } } } },
  section: { select: {
    sectionId: true, sectionCode: true, semesterId: true,
    semester: { select: { timeZone: true } },
    course: { select: { courseId: true, courseCode: true, courseTitle: true, departmentId: true, courseLevel: true } },
    classMeetings: { orderBy: { meetingId: "asc" as const }, select: {
      meetingId: true, dayOfWeek: true, startTime: true, endTime: true, location: true,
    } },
  } },
  // Signup currently writes one observation, but the schema permits more. Detect
  // ambiguity instead of silently selecting a record or combining separate lists.
  observations: { take: 2, orderBy: { observationId: "asc" as const }, select: {
    observationId: true, workflowRevision: true, recommendationGenerationId: true, recommendationsReleasedAt: true,
    timeOptions: { orderBy: [{ preferredDate: "asc" as const }, { timeOptionId: "asc" as const }], select: {
      timeOptionId: true, preferredDate: true, startsAt: true, endsAt: true, timeZone: true, location: true,
    } },
  } },
} satisfies Prisma.EvaluationSignupSelect;
type SignupRow = Prisma.EvaluationSignupGetPayload<{ select: typeof select }>;

function signupResponse(row: SignupRow) {
  if (row.observations.length > 1) {
    throw new ConfigurationError(409, "AMBIGUOUS_OBSERVATION", "A signup has multiple observations and requires review.");
  }
  const observation = row.observations[0], section = row.section, course = section.course;
  return {
    signupId: row.signupId, observationId: observation?.observationId ?? null,
    observee: { id: row.professor.user.userId, name: row.professor.user.fullName, email: row.professor.user.email },
    section: {
      id: section.sectionId, sectionNumber: section.sectionCode, semesterId: section.semesterId,
      course: { id: course.courseId, code: course.courseCode, title: course.courseTitle, departmentId: course.departmentId, level: course.courseLevel },
      meetings: section.classMeetings.map(meeting => ({
        id: meeting.meetingId, weekday: meeting.dayOfWeek, startTime: meeting.startTime,
        endTime: meeting.endTime, timeZone: section.semester.timeZone, location: meeting.location,
      })),
    },
    proposedMeetings: (observation?.timeOptions ?? []).map(option => ({
      id: option.timeOptionId, sectionId: section.sectionId, date: option.preferredDate.toISOString().slice(0, 10),
      startsAt: option.startsAt?.toISOString() ?? null, endsAt: option.endsAt?.toISOString() ?? null,
      timeZone: option.timeZone, location: option.location,
    })),
    signedUpAt: row.signupDate.toISOString(),
    observationRevision: observation?.workflowRevision ?? null,
    recommendationGenerationId: observation?.recommendationGenerationId ?? null,
    recommendationsReleasedAt: observation?.recommendationsReleasedAt?.toISOString() ?? null,
  };
}

/** Provisional university-wide AC scope, matching existing reporting. Own Faculty
 * participation and role labels never substitute for the signups.read grant. */
export async function getCycleSignups(db: SignupDatabase, user: ConfigurationUser, cycleId: string, url: URL) {
  if (!user.permissions.includes("signups.read")) throw new ConfigurationError(403, "FORBIDDEN", "Access denied.");
  const id = uuid(cycleId).toLowerCase(), query = filters(url);
  const cycle = await db.evaluationCycle.findUnique({ where: { cycleId: id }, select: { cycleId: true } });
  if (!cycle) throw new ConfigurationError(404, "NOT_FOUND", "Evaluation cycle not found.");
  const clauses: Prisma.EvaluationSignupWhereInput[] = [{ cycleId: id }];
  if (query.departmentId) clauses.push({ professor: { departmentId: query.departmentId } });
  if (query.hiringLevelId) clauses.push({ professor: { hiringLevelId: query.hiringLevelId } });
  if (query.q) {
    const contains = { contains: query.q, mode: "insensitive" as const };
    clauses.push({ OR: [
      { professor: { user: { fullName: contains } } }, { professor: { user: { email: contains } } },
      { section: { course: { courseCode: contains } } }, { section: { course: { courseTitle: contains } } },
      { section: { sectionCode: contains } },
    ] });
  }
  if (query.cursor) {
    const anchor = await db.evaluationSignup.findFirst({
      where: { AND: [...clauses, { signupId: query.cursor }] }, select: { signupId: true },
    });
    if (!anchor) invalidQuery("Invalid cursor for this cycle and filters.");
    clauses.push({ signupId: { gt: query.cursor } });
  }
  const rows = await db.evaluationSignup.findMany({ where: { AND: clauses }, select,
    orderBy: { signupId: "asc" }, take: query.limit + 1 });
  const items = rows.slice(0, query.limit).map(signupResponse), hasMore = rows.length > query.limit;
  return { items, pageInfo: { nextCursor: hasMore ? items.at(-1)!.signupId : null, hasMore } };
}
