import type { Prisma } from "../../generated/prisma/client";
import { pagination, uuid } from "../configuration-validation";
import { availableOption, observerAvailable, workflowObservation } from "../services/faculty-invitations";

type Db = Prisma.TransactionClient;

function person(user: { userId: string; fullName: string; username: string | null; email: string }) {
  return { id: user.userId, name: user.fullName, displayName: user.fullName, username: user.username, email: user.email };
}

function page<T>(rows: T[], limit: number, id: (item: T) => string) {
  const items = rows.slice(0, limit), hasMore = rows.length > limit;
  return { items, pageInfo: { nextCursor: hasMore ? id(items.at(-1)!) : null, hasMore } };
}

function storedMeetings(record: Awaited<ReturnType<typeof workflowObservation>>) {
  return record.timeOptions.flatMap(option => option.startsAt && option.endsAt && option.timeZone ? [{
    id: option.timeOptionId,
    sectionId: record.signup.sectionId,
    date: option.preferredDate.toISOString().slice(0, 10),
    startsAt: option.startsAt.toISOString(),
    endsAt: option.endsAt.toISOString(),
    timeZone: option.timeZone,
    location: option.location,
  }] : []);
}

export async function getObserverSelectionSignups(db: Db, cycleId: string, url: URL) {
  const id = uuid(cycleId), { limit, cursor } = pagination(url);
  const exists = await db.evaluationCycle.findUnique({ where: { cycleId: id }, select: { cycleId: true } });
  if (!exists) return { items: [], pageInfo: { nextCursor: null, hasMore: false } };
  const records = await db.observation.findMany({
    where: { cycleId: id, ...(cursor ? { observationId: { gt: uuid(cursor) } } : {}) },
    include: {
      signup: { include: { professor: { include: { user: true } }, section: { include: { course: true } } } },
      timeOptions: { orderBy: { preferredDate: "asc" } },
    },
    orderBy: { observationId: "asc" }, take: limit + 1,
  });
  const rows = records.map(record => ({
    signupId: record.signupId,
    observationId: record.observationId,
    observee: person(record.signup.professor.user),
    section: {
      id: record.signup.sectionId,
      sectionNumber: record.signup.section.sectionCode,
      semesterId: record.signup.section.semesterId,
      course: {
        id: record.signup.section.courseId,
        code: record.signup.section.course.courseCode,
        title: record.signup.section.course.courseTitle,
        departmentId: record.signup.section.course.departmentId,
        level: record.signup.section.course.courseLevel,
      },
    },
    proposedMeetings: record.timeOptions.flatMap(option => option.startsAt && option.endsAt && option.timeZone ? [{
      id: option.timeOptionId,
      sectionId: record.signup.sectionId,
      date: option.preferredDate.toISOString().slice(0, 10),
      startsAt: option.startsAt.toISOString(),
      endsAt: option.endsAt.toISOString(),
      timeZone: option.timeZone,
      location: option.location,
    }] : []),
    signedUpAt: record.signup.signupDate.toISOString(),
  }));
  return page(rows, limit, item => item.observationId);
}

export async function getObserverCandidates(db: Db, observationId: string) {
  const record = await workflowObservation(db, uuid(observationId));
  const now = new Date();
  const options = record.timeOptions.flatMap(option => {
    try { return [availableOption(record, option.timeOptionId, now)]; }
    catch { return []; }
  });
  const candidates = await db.observationCandidate.findMany({
    where: { observationId: record.observationId },
    include: { professor: { include: { user: true, teaches: { include: { section: { include: { course: true, semester: true } } } } } } },
    orderBy: { candidateId: "asc" },
  });
  const items = await Promise.all(candidates.map(async candidate => ({
    id: candidate.candidateId,
    observationId: record.observationId,
    professor: person(candidate.professor.user),
    availableMeetingOptionIds: (await Promise.all(options.map(async option =>
      await observerAvailable(db, record, candidate.professorId, option) ? option.timeOptionId : null)))
      .filter((id): id is string => id !== null),
    responseStatus: candidate.status,
    acceptedMeetingOptionId: candidate.acceptedOptionId,
    courseHistory: candidate.professor.teaches.slice(0, 3)
      .map(teaching => `${teaching.section.course.courseCode} · ${teaching.section.semester.termName}`).join(", ") || null,
  })));
  return {
    observationId: record.observationId,
    generationId: record.recommendationGenerationId ?? undefined,
    releasedAt: record.recommendationsReleasedAt?.toISOString() ?? null,
    proposedMeetings: storedMeetings(record),
    items,
    pageInfo: { nextCursor: null, hasMore: false },
  };
}
