import { createHash } from "node:crypto";
import type { AccountUser } from "@/server/account-auth";
import type { ObservationRead } from "@/lib/observation-contract";

// Temporary backend dataset, approved for local integration while CourseBook
// import/database work is pending. These are Figma examples, not faculty records.
const records = [
  {
    id: "sample-1",
    semester: "Fall 2026",
    participation: "observee",
    courseSection: "CS 4485.001",
    otherProfessor: "Professor A",
    statusLabel: "Completed",
  },
  {
    id: "sample-2",
    semester: "Spring 2026",
    participation: "observer",
    courseSection: "CS 3345.002",
    otherProfessor: "Professor B",
    statusLabel: "Completed",
  },
  {
    id: "sample-3",
    semester: "Fall 2025",
    participation: "observee",
    courseSection: "CS 2336.003",
    otherProfessor: "Professor C",
    statusLabel: "Completed",
  },
  {
    id: "sample-4",
    semester: "Spring 2025",
    participation: "observer",
    courseSection: "CS 4349.001",
    otherProfessor: "Professor D",
    statusLabel: "Completed",
  },
] as const;

/** Caller must come from the server session, never a request-supplied user ID.
 * Replace this provider with an authorized database query when data is ready.
 */
type HistoryCaller = Pick<AccountUser, "id" | "name" | "permissions">;

function assertDemoUser(user: HistoryCaller, env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== "development" || env.AUTH_DEMO_ENABLED !== "true")
    throw new Error("Demo history is disabled.");
  if (
    !(
      ["demo:faculty", "demo:ac", "demo:admin"].includes(user.id) ||
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(user.id)
    ) ||
    !user.permissions.includes("observations.read.own")
  ) {
    throw new Error("History access denied.");
  }
}

interface Professor {
  professorId: string;
  userId: string;
  user: { userId: string; fullName: string };
}
export interface DemoObservation {
  observationId: string;
  signupId: string;
  cycleId: string;
  observerId: string | null;
  status: string;
  scheduledAt: string | null;
  completedAt: string | null;
  observer: Professor | null;
  signup: {
    signupId: string;
    cycleId: string;
    professorId: string;
    sectionId: string;
    professor: Professor;
    section: {
      sectionId: string;
      semesterId: string;
      sectionCode: string;
      semester: { semesterId: string; termCode: string; termName: string };
      course: {
        courseId: string;
        departmentId: string;
        courseCode: string;
        courseTitle: string;
        courseLevel: number;
      };
    };
  };
}

/** Synthetic UUIDs preserve Haris's UUID types. AppUser and Professor IDs differ. */
function uuid(namespace: number, index: number) {
  return `00000000-0000-4000-8000-${(namespace * 1000 + index).toString(16).padStart(12, "0")}`;
}

/** Nested fixture relations/field names follow Haris's PR #49, d3c4587.
 * In production, resolve AppUser.userId -> Professor.professorId in the database.
 */
export function getDemoHistorySource(
  user: HistoryCaller,
  env = process.env,
): { professorId: string; observations: DemoObservation[] } {
  assertDemoUser(user, env);
  const namespace = Number.parseInt(
    createHash("sha256").update(user.id).digest("hex").slice(0, 8),
    16,
  );
  function professor(index: number, name: string): Professor {
    const userId = uuid(namespace, 100 + index);
    return { professorId: uuid(namespace, 200 + index), userId, user: { userId, fullName: name } };
  }
  const self = professor(0, user.name);
  return {
    professorId: self.professorId,
    observations: records.map((record, index) => {
      const other = professor(index + 1, record.otherProfessor);
      const observee = record.participation === "observee" ? self : other;
      const observer = record.participation === "observer" ? self : other;
      const signupId = uuid(namespace, 300 + index),
        cycleId = uuid(namespace, 400 + index);
      const sectionId = uuid(namespace, 500 + index),
        semesterId = uuid(namespace, 600 + index);
      const [courseCode, sectionCode] = record.courseSection.split(".");
      return {
        observationId: uuid(namespace, 700 + index),
        signupId,
        cycleId,
        observerId: observer.professorId,
        status: "COMPLETED",
        scheduledAt: null,
        completedAt: null,
        observer,
        signup: {
          signupId,
          cycleId,
          professorId: observee.professorId,
          sectionId,
          professor: observee,
          section: {
            sectionId,
            semesterId,
            sectionCode,
            semester: {
              semesterId,
              termCode: record.semester.replace(" ", "-"),
              termName: record.semester,
            },
            course: {
              courseId: uuid(namespace, 800 + index),
              departmentId: uuid(namespace, 900),
              courseCode,
              courseTitle: courseCode,
              courseLevel: Number(courseCode.split(" ")[1][0]) * 1000,
            },
          },
        },
      };
    }),
  };
}

/** Future Prisma ownership predicate:
 * OR: [{ signup: { professorId } }, { observerId: professorId }].
 * Invitations/candidate membership alone never grant access to observations.
 */
export function projectPersonalObservations(
  professorId: string,
  observations: readonly DemoObservation[],
): ObservationRead[] {
  return observations
    .filter((item) => item.signup.professorId === professorId || item.observerId === professorId)
    .map((item) => {
      const { section, professor } = item.signup;
      if (
        item.signupId !== item.signup.signupId ||
        item.cycleId !== item.signup.cycleId ||
        item.signup.sectionId !== section.sectionId ||
        section.semesterId !== section.semester.semesterId ||
        item.observerId !== (item.observer?.professorId ?? null)
      )
        throw new Error("Inconsistent observation relations.");
      return {
        id: item.observationId,
        signupId: item.signupId,
        cycleId: item.cycleId,
        section: {
          id: section.sectionId,
          course: {
            id: section.course.courseId,
            code: section.course.courseCode,
            title: section.course.courseTitle,
            departmentId: section.course.departmentId,
            level: section.course.courseLevel,
          },
          sectionNumber: section.sectionCode,
          semesterId: section.semesterId,
          semester: { id: section.semesterId, name: section.semester.termName },
          meetings: [],
        },
        observee: { id: professor.user.userId, name: professor.user.fullName },
        observer: item.observer
          ? { id: item.observer.user.userId, name: item.observer.user.fullName }
          : null,
        participation: [
          ...(item.signup.professorId === professorId ? ["observee" as const] : []),
          ...(item.observerId === professorId ? ["observer" as const] : []),
        ],
        status: item.status,
        assessmentStatus: null,
        scheduledMeeting: null,
        occurred: null,
        revision: null,
        allowedActions: [],
      };
    });
}

export function getDemoObservationHistory(
  user: HistoryCaller,
  env = process.env,
): ObservationRead[] {
  const source = getDemoHistorySource(user, env);
  return projectPersonalObservations(source.professorId, source.observations);
}

export class ObservationQueryError extends Error {}
export function queryPersonalObservations(
  items: readonly ObservationRead[],
  params: URLSearchParams,
) {
  const allowed = [
    "cycleId",
    "semesterId",
    "participation",
    "status",
    "assessmentStatus",
    "cursor",
    "limit",
  ];
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1 || !params.get(key)?.trim())
      throw new ObservationQueryError("Invalid query parameters.");
  }
  const rawParticipation = params.get("participation");
  if (rawParticipation && rawParticipation !== "observer" && rawParticipation !== "observee")
    throw new ObservationQueryError("Invalid participation.");
  const participation = rawParticipation as "observer" | "observee" | null;
  const rawLimit = params.get("limit") ?? "20";
  if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100)
    throw new ObservationQueryError("Limit must be between 1 and 100.");
  const filtered = items.filter(
    (item) =>
      (!params.has("cycleId") || item.cycleId === params.get("cycleId")) &&
      (!params.has("semesterId") || item.section.semesterId === params.get("semesterId")) &&
      (!participation || item.participation.includes(participation)) &&
      (!params.has("status") || item.status === params.get("status")) &&
      (!params.has("assessmentStatus") || item.assessmentStatus === params.get("assessmentStatus")),
  );
  const cursor = params.get("cursor");
  const cursorIndex = cursor ? filtered.findIndex((item) => item.id === cursor) : -1;
  if (cursor && cursorIndex < 0) throw new ObservationQueryError("Invalid cursor.");
  const start = cursorIndex + 1,
    page = filtered.slice(start, start + Number(rawLimit));
  const hasMore = start + page.length < filtered.length;
  return {
    items: page,
    pageInfo: { hasMore, nextCursor: hasMore ? page.at(-1)!.id : null },
    dataSource: "demo" as const,
  };
}
