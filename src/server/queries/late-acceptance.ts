import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { currentSemesterCycle } from "../../lib/observer-selection";
import { pagination, ConfigurationError } from "../configuration-validation";
import { FacultyActionError } from "../services/faculty-errors";
import { meetingOccurrence } from "../services/faculty-meetings";
import { lateAcceptanceState } from "../services/late-acceptance-state";
export { lateAcceptanceState } from "../services/late-acceptance-state";

type Connection = Pick<Prisma.TransactionClient, "evaluationCycle" | "lateAcceptanceApproval">;
export async function currentLateAcceptanceCycle(db: Pick<Connection, "evaluationCycle">, now: Date) {
  const cycles = await db.evaluationCycle.findMany({ include: { semester: true } });
  const selected = currentSemesterCycle(cycles.map(c => ({ id: c.cycleId, semester: {
    name: c.semester.termName, startsOn: c.semester.startsOn?.toISOString().slice(0, 10),
    endsOn: c.semester.endsOn?.toISOString().slice(0, 10), timeZone: c.semester.timeZone,
  } })), now.getTime());
  return cycles.find(c => c.cycleId === selected?.id) ?? null;
}

export const lateAcceptanceInclude = { attempt: { include: { candidate: { include: {
  professor: { include: { user: { select: { userId: true, fullName: true } } } },
  attempts: { orderBy: { number: "desc" }, take: 1 },
  observation: { include: { cycle: { include: { semester: true } }, signedAssessment: true,
    currentReleasedList: true, timeOptions: { orderBy: [{ preferredDate: "asc" }, { timeOptionId: "asc" }] },
    signup: { include: { professor: { include: { user: { select: { userId: true, fullName: true } } } },
      section: { include: { course: true, classMeetings: true } } } } } },
} } } } } satisfies Prisma.LateAcceptanceApprovalInclude;
type Record = Prisma.LateAcceptanceApprovalGetPayload<{ include: typeof lateAcceptanceInclude }>;

function requestResponse(request: Record, now: Date) {
  const candidate = request.attempt.candidate, observation = candidate.observation;
  const section = observation.signup.section, semester = observation.cycle.semester;
  const state = lateAcceptanceState(request, now);
  return { ...request, id: request.approvalId, persistedStatus: request.status,
    displayStatus: request.status === "PENDING" && !state.actionable ? state.reasonCode : request.status,
    actionable: state.actionable, reasonCode: state.reasonCode, actionReason: state.reason,
    requester: { id: candidate.professor.user.userId, name: candidate.professor.user.fullName },
    observee: { id: observation.signup.professor.user.userId, name: observation.signup.professor.user.fullName },
    observationId: observation.observationId, course: section.course.courseCode, section: section.sectionCode,
    originalInvitationExpiresAt: request.attempt.expiresAt.toISOString(),
    observationDeadline: observation.cycle.observationDeadline.toISOString(), timeZone: semester.timeZone,
    proposedMeetings: observation.timeOptions.map(option => {
      const date = option.preferredDate.toISOString().slice(0, 10);
      const occurrence = meetingOccurrence(date, section.classMeetings.map(m => ({ id: m.meetingId, day: m.dayOfWeek, startTime: m.startTime, endTime: m.endTime, location: m.location })), semester.timeZone);
      return { id: option.timeOptionId, sectionId: section.sectionId, date,
        startsAt: (option.startsAt ?? occurrence?.startsAt)?.toISOString() ?? null,
        endsAt: (option.endsAt ?? occurrence?.endsAt)?.toISOString() ?? null,
        timeZone: option.timeZone ?? semester.timeZone, location: option.location ?? occurrence?.location ?? null };
    }),
    // Retain the original approval/attempt shape, but do not expose internal observation records.
    attempt: { ...request.attempt, candidate: { ...candidate, observation: undefined, attempts: undefined } },
  };
}

export async function getLateAcceptanceRequests(db: Connection, user: { permissions: string[] }, cycleId: string, url: URL, now = new Date()) {
  if (!user.permissions.includes("late-acceptance.review")) throw new FacultyActionError("Forbidden", 403);
  const { limit, cursor } = pagination(url);
  const rawSearch = url.searchParams.get("search") ?? "";
  if (rawSearch.length > 200 || /[\u0000-\u001f\u007f]/.test(rawSearch)) throw new ConfigurationError(422, "VALIDATION_ERROR", "Search must be observer name text of at most 200 characters.");
  const search = rawSearch.trim();
  const status = url.searchParams.get("status") ?? "all";
  if (!["all", "pending", "approved", "rejected", "notActionable"].includes(status)) throw new ConfigurationError(422, "VALIDATION_ERROR", "Invalid request status.");
  const requestId = url.searchParams.get("requestId");
  const uuid = (value: string) => { if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)) throw new FacultyActionError("A valid record identifier is required.", 400); return value.toLowerCase(); };
  if (requestId) uuid(requestId);
  const cycle = cycleId === "current" ? await currentLateAcceptanceCycle(db, now) : await db.evaluationCycle.findUnique({ where: { cycleId: uuid(cycleId) }, include: { semester: true } });
  if (!cycle && cycleId !== "current") throw new FacultyActionError("Evaluation cycle not found.", 404);
  if (!cycle) return { cycle: null, items: [], summary: { pending: 0, approved: 0, notActionable: 0, total: 0 }, pageInfo: { hasMore: false, nextCursor: null } };
  // Derived actionability needs linked state; compute over the complete cycle before pagination.
  const rows = await db.lateAcceptanceApproval.findMany({ where: { attempt: { candidate: { observation: { cycleId: cycle.cycleId } } } }, include: lateAcceptanceInclude, orderBy: [{ requestedAt: "desc" }, { approvalId: "desc" }] });
  const all = rows.map(row => requestResponse(row, now));
  const summary = { pending: all.filter(r => r.actionable).length, approved: all.filter(r => r.status === "APPROVED").length,
    notActionable: all.filter(r => r.status === "PENDING" && !r.actionable).length, total: all.length };
  const matches = requestId ? all.filter(r => r.id === requestId.toLowerCase()) : all.filter(r => r.requester.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
    (status === "all" || (status === "pending" ? r.actionable : status === "notActionable" ? r.status === "PENDING" && !r.actionable : r.status === status.toUpperCase())));
  if (requestId && !matches.length) throw new FacultyActionError("Request not found in this cycle.", 404);
  const offset = cursor && !requestId ? matches.findIndex(r => r.id === cursor.toLowerCase()) + 1 : 0;
  if (cursor && !requestId && !offset) throw new FacultyActionError("The request list changed. Refresh requests.");
  const items = matches.slice(offset, offset + limit), hasMore = offset + limit < matches.length;
  return { cycle: { id: cycle.cycleId, name: cycle.semester.termName, timeZone: cycle.semester.timeZone }, items, summary,
    pageInfo: { hasMore, nextCursor: hasMore ? items.at(-1)!.id : null } };
}
