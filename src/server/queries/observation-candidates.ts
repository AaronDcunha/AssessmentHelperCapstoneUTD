import type { Prisma } from "../../generated/prisma/client";
import { ConfigurationError, pagination, uuid, type ConfigurationUser } from "../configuration-validation";
import { availableOption, observerAvailable, workflowObservation } from "../services/faculty-invitations";
import { FacultyActionError } from "../services/faculty-errors";

const allowed = new Set(["responseStatus", "cursor", "limit", "listId"]);
const invalid = (message: string): never => { throw new ConfigurationError(400, "INVALID_QUERY", message); };

function filters(url: URL) {
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1 || !url.searchParams.get(key)?.trim()) {
      invalid("Unknown, repeated or empty query parameter.");
    }
  }
  const responseStatus = url.searchParams.get("responseStatus");
  // Status columns are strings, not an agreed business enum. Match the actual
  // latest attempt's recorded value; never reinterpret SELECTED as a response.
  if (responseStatus && !/^[A-Z][A-Z_]{0,49}$/.test(responseStatus)) invalid("responseStatus must be a stored uppercase attempt status.");
  const { cursor, limit } = pagination(url);
  const listId = url.searchParams.get("listId");
  return { responseStatus, cursor: cursor?.toLowerCase() ?? null, limit, listId: listId ? uuid(listId).toLowerCase() : null };
}

const attemptSelect = {
  attemptId: true, candidateId: true, number: true, invitedAt: true,
  expiresAt: true, respondedAt: true, status: true,
} satisfies Prisma.InvitationAttemptSelect;

// Use the stored academic term, not its display name or UUID. This follows the
// existing YYs/YYu/YYf chronology in faculty-evaluation and AC reporting. Unknown
// legacy term codes sort last without guessing dates from their labels.
function teachingTermOrder(code: string): number | null {
  const match = /^(\d{2})([suf])$/.exec(code);
  return match ? (2000 + Number(match[1])) * 3 + { s: 0, u: 1, f: 2 }[match[2] as "s" | "u" | "f"] : null;
}

/** Phase 1: university-wide AC observation reads only. This does not introduce
 * own-observee access. Call within
 * a repeatable-read transaction so cursor/status/detail reads share a snapshot. */
export async function getObservationCandidates(
  db: Prisma.TransactionClient, user: ConfigurationUser, observationId: string, url: URL, now = new Date(),
) {
  if (!user.permissions.includes("observations.read")) throw new ConfigurationError(403, "FORBIDDEN", "Access denied.");
  const id = uuid(observationId).toLowerCase(), query = filters(url);
  let record: Awaited<ReturnType<typeof workflowObservation>>;
  try { record = await workflowObservation(db, id); }
  catch (error) {
    if (error instanceof FacultyActionError && error.status === 404) throw new ConfigurationError(404, "NOT_FOUND", "Observation not found.");
    throw error;
  }
  const section = record.signup.section;
  if (section.semesterId !== record.cycle.semesterId) {
    throw new ConfigurationError(409, "INCONSISTENT_OBSERVATION", "The observation's section and cycle semesters differ.");
  }
  // Explicit history reads remain AC-only. Default to the current draft, then
  // current release. Unclassified imports are never silently made current.
  const listId = query.listId ?? record.currentDraftListId ?? record.currentReleasedListId;
  const list = listId ? await db.recommendationList.findFirst({ where: { listId, observationId: id } }) : null;
  if (listId && !list) throw new ConfigurationError(404, "NOT_FOUND", "Recommendation list not found.");

  // Filter latest recorded responses before pagination. Filtering attempts by
  // status before taking the latest would incorrectly match superseded windows.
  // Read only small state rows for this observation's existing single list.
  const states = list ? await db.observationCandidate.findMany({
    where: { observationId: id, recommendationListId: list.listId }, orderBy: { candidateId: "asc" },
    select: { candidateId: true, attempts: { orderBy: { number: "desc" }, take: 1, select: { status: true } } },
  }) : [];
  const matching = states.filter(candidate => !query.responseStatus || candidate.attempts[0]?.status === query.responseStatus);
  if (query.cursor && !matching.some(candidate => candidate.candidateId === query.cursor)) {
    invalid("Invalid cursor for this observation and response filter.");
  }
  const page = matching.filter(candidate => !query.cursor || candidate.candidateId > query.cursor).slice(0, query.limit + 1);
  const hasMore = page.length > query.limit, ids = page.slice(0, query.limit).map(candidate => candidate.candidateId);
  const candidates = ids.length ? await db.observationCandidate.findMany({
    where: { observationId: id, recommendationListId: list!.listId, candidateId: { in: ids } }, orderBy: { candidateId: "asc" },
    select: {
      candidateId: true, observationId: true, professorId: true, status: true,
      invitedAt: true, expiresAt: true, respondedAt: true, acceptedOptionId: true,
      attempts: { orderBy: { number: "desc" }, take: 1, select: attemptSelect },
      professor: { select: {
        user: { select: { userId: true, fullName: true } },
        // Historical teaching is display evidence only. observerAvailable still
        // independently checks eligibility and conflicts in the cycle semester.
        teaches: { where: { section: { course: { courseLevel: section.course.courseLevel } } },
          orderBy: { sectionId: "asc" }, select: { section: { select: {
            course: { select: { courseId: true, courseCode: true, courseTitle: true, courseLevel: true, departmentId: true } },
            semester: { select: { semesterId: true, termName: true, termCode: true } },
          } } } },
      } },
    },
  }) : [];

  const options: ReturnType<typeof availableOption>[] = [];
  for (const option of record.timeOptions) {
    try { options.push(availableOption(record, option.timeOptionId, now)); }
    catch (error) { if (!(error instanceof FacultyActionError)) throw error; }
  }
  const items = [];
  for (const candidate of candidates) {
    if (candidate.acceptedOptionId && !record.timeOptions.some(option => option.timeOptionId === candidate.acceptedOptionId)) {
      throw new ConfigurationError(409, "INCONSISTENT_CANDIDATE", "A candidate's accepted meeting does not belong to this observation.");
    }
    const compatible = [];
    for (const option of options) {
      if (await observerAvailable(db, record, candidate.professorId, option)) compatible.push(option.timeOptionId);
    }
    const courses = new Map(candidate.professor.teaches.map(assignment => {
      const { course, semester } = assignment.section;
      return [`${course.courseId}:${semester.semesterId}`, {
        termOrder: teachingTermOrder(semester.termCode),
        course: { id: course.courseId, code: course.courseCode, title: course.courseTitle, departmentId: course.departmentId, level: course.courseLevel },
        semester: { id: semester.semesterId, name: semester.termName },
      }];
    }));
    const attempt = candidate.attempts[0];
    items.push({
      id: candidate.candidateId, observationId: candidate.observationId,
      professor: { id: candidate.professor.user.userId, name: candidate.professor.user.fullName },
      status: candidate.status, responseStatus: attempt?.status ?? null,
      outcome: candidate.status === "SELECTED" || candidate.status === "CANCELLED" ? candidate.status : null,
      invitedAt: candidate.invitedAt?.toISOString() ?? null, expiresAt: candidate.expiresAt?.toISOString() ?? null,
      respondedAt: candidate.respondedAt?.toISOString() ?? null, acceptedMeetingOptionId: candidate.acceptedOptionId,
      availableMeetingOptionIds: compatible,
      // This is the real latest attempt, even if answered/expired/cancelled.
      // Accepted option is not stored per attempt; do not synthesize that field.
      activeAttempt: attempt ? {
        id: attempt.attemptId, candidateId: attempt.candidateId, sequence: attempt.number,
        sentAt: attempt.invitedAt.toISOString(), expiresAt: attempt.expiresAt.toISOString(),
        responseStatus: attempt.status, respondedAt: attempt.respondedAt?.toISOString() ?? null,
      } : null,
      courseHistory: [...courses.values()].sort((a, b) =>
        (b.termOrder ?? -1) - (a.termOrder ?? -1)
        || a.course.code.localeCompare(b.course.code) || a.course.id.localeCompare(b.course.id)
        || a.semester.id.localeCompare(b.semester.id)
      ).slice(0, 5).map(({ course, semester }) => ({ course, semester })),
    });
  }
  return {
    observationId: id, observationRevision: record.workflowRevision,
    currentDraftListId: record.currentDraftListId, currentReleasedListId: record.currentReleasedListId,
    list: list ? { id: list.listId, generationId: list.generationId, generatedAt: list.generatedAt?.toISOString() ?? null,
      publishedAt: list.publishedAt?.toISOString() ?? null, origin: list.origin } : null,
    generationId: record.recommendationGenerationId, releasedAt: record.recommendationsReleasedAt?.toISOString() ?? null,
    proposedMeetings: record.timeOptions.slice().sort((a, b) => a.preferredDate.getTime() - b.preferredDate.getTime() || a.timeOptionId.localeCompare(b.timeOptionId)).map(option => ({
      id: option.timeOptionId, sectionId: section.sectionId, date: option.preferredDate.toISOString().slice(0, 10),
      startsAt: option.startsAt?.toISOString() ?? null, endsAt: option.endsAt?.toISOString() ?? null,
      timeZone: option.timeZone, location: option.location,
    })),
    items, pageInfo: { nextCursor: hasMore ? items.at(-1)!.id : null, hasMore },
  };
}
