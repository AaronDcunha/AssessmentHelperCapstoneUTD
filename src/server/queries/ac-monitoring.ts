import type { PrismaClient } from "../../generated/prisma/client";
import { ConfigurationError, invalid, pagination, uuid } from "../configuration-validation";

type Db = PrismaClient;

function userResponse(user: { userId: string; fullName: string; username: string | null; email: string }) {
  return { id: user.userId, name: user.fullName, displayName: user.fullName, username: user.username, email: user.email };
}

function list<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, pageInfo: { nextCursor: hasMore ? items.at(-1)!.id : null, hasMore } };
}

async function cycleOrThrow(db: Db, cycleId: string) {
  const cycle = await db.evaluationCycle.findUnique({ where: { cycleId: uuid(cycleId) }, include: { semester: true } });
  if (!cycle) throw new ConfigurationError(404, "NOT_FOUND", "Evaluation cycle not found.");
  return cycle;
}

function yearOf(value: string) {
  const year = /(?:19|20)\d{2}/.exec(value)?.[0];
  return year ? Number(year) : null;
}

type FacultyRow = {
  id: string;
  professor: ReturnType<typeof userResponse>;
  hiringLevel: { id: string; name: string };
  lastEvaluation: { semester: { id: string; name: string }; completedAt: string } | null;
  evaluationStatus: string;
  signupId: string | null;
  observationId: string | null;
  departmentId: string;
};

async function allFacultyStatuses(db: Db, cycleId: string): Promise<FacultyRow[]> {
  const cycle = await cycleOrThrow(db, cycleId);
  const [professors, signups, completed] = await Promise.all([
    db.professor.findMany({
      where: { user: { isActive: true } },
      include: { user: true, hiringLevel: true },
      orderBy: { professorId: "asc" },
    }),
    db.evaluationSignup.findMany({
      where: { cycleId: cycle.cycleId },
      include: { observations: { select: { observationId: true, completedAt: true, signedAssessment: { select: { completedAt: true } } } } },
    }),
    db.observation.findMany({
      where: { OR: [{ completedAt: { not: null } }, { signedAssessment: { completedAt: { not: null } } }] },
      include: { signup: { select: { professorId: true } }, cycle: { include: { semester: true } }, signedAssessment: { select: { completedAt: true } } },
    }),
  ]);
  const currentSignup = new Map(signups.map(signup => [signup.professorId, signup]));
  const lastCompleted = new Map<string, (typeof completed)[number]>();
  const completedTime = (observation: (typeof completed)[number]) => (observation.signedAssessment?.completedAt ?? observation.completedAt)?.getTime() ?? 0;
  completed.sort((a, b) => completedTime(b) - completedTime(a));
  for (const observation of completed) if (!lastCompleted.has(observation.signup.professorId)) lastCompleted.set(observation.signup.professorId, observation);
  const selectedYear = yearOf(cycle.semester.termName) ?? yearOf(cycle.semester.termCode);

  return professors.map((professor) => {
    const signup = currentSignup.get(professor.professorId);
    const last = lastCompleted.get(professor.professorId);
    const lastYear = last ? yearOf(last.cycle.semester.termName) ?? yearOf(last.cycle.semester.termCode) : null;
    const firstSemester = !!(professor.hireDate && cycle.semester.startsOn && cycle.semester.endsOn
      && professor.hireDate >= cycle.semester.startsOn && professor.hireDate <= cycle.semester.endsOn);
    let evaluationStatus = "unknown";
    if (firstSemester) evaluationStatus = "ineligible";
    else if (selectedYear !== null && lastYear !== null) {
      const dueYear = lastYear + professor.hiringLevel.evaluationIntervalYears;
      evaluationStatus = selectedYear > dueYear ? "overdue" : selectedYear === dueYear ? "due" : "notDue";
    }
    const completedAt = last?.signedAssessment?.completedAt ?? last?.completedAt ?? null;
    return {
      id: professor.professorId,
      professor: userResponse(professor.user),
      hiringLevel: { id: professor.hiringLevelId, name: professor.hiringLevel.levelName },
      lastEvaluation: last && completedAt ? {
        semester: { id: last.cycle.semester.semesterId, name: last.cycle.semester.termName },
        completedAt: completedAt.toISOString(),
      } : null,
      evaluationStatus,
      signupId: signup?.signupId ?? null,
      observationId: signup?.observations[0]?.observationId ?? null,
      departmentId: professor.departmentId,
    };
  });
}

export async function getFacultyStatus(db: Db, cycleId: string, url: URL) {
  const { limit, cursor } = pagination(url);
  const hiringLevelId = url.searchParams.get("hiringLevelId");
  const departmentId = url.searchParams.get("departmentId");
  const evaluationStatus = url.searchParams.get("evaluationStatus");
  const signedUp = url.searchParams.get("signedUp");
  const q = url.searchParams.get("q")?.trim().toLowerCase();
  if (hiringLevelId) uuid(hiringLevelId);
  if (departmentId) uuid(departmentId);
  if (evaluationStatus && !["due", "overdue", "notDue", "ineligible", "unknown"].includes(evaluationStatus)) invalid("Invalid evaluation status.");
  if (signedUp && !["true", "false"].includes(signedUp)) invalid("signedUp must be true or false.");
  let rows = await allFacultyStatuses(db, cycleId);
  rows = rows.filter(row => (!cursor || row.id > cursor)
    && (!hiringLevelId || row.hiringLevel.id === hiringLevelId)
    && (!departmentId || row.departmentId === departmentId)
    && (!evaluationStatus || row.evaluationStatus === evaluationStatus)
    && (!signedUp || Boolean(row.signupId) === (signedUp === "true"))
    && (!q || `${row.professor.name} ${row.professor.email} ${row.professor.username}`.toLowerCase().includes(q)));
  return list(rows.map(row => ({ id: row.id, professor: row.professor, hiringLevel: row.hiringLevel,
    lastEvaluation: row.lastEvaluation, evaluationStatus: row.evaluationStatus,
    signupId: row.signupId, observationId: row.observationId })), limit);
}

function observationStatus(observation: { status: string; observerId: string | null; completedAt: Date | null }, observationDeadline: Date) {
  if (observation.completedAt || ["complete", "completed"].includes(observation.status.toLowerCase())) return "complete";
  if (!observation.observerId) return "unmatched";
  if (new Date() > observationDeadline) return "incomplete";
  return "in-progress";
}

function assessmentStatus(assessment: { isLocked: boolean; completedAt: Date | null; observerSignedAt: Date | null; observeeSignedAt: Date | null } | null) {
  if (!assessment) return "Not started";
  if (assessment.isLocked || assessment.completedAt) return "Complete";
  if (assessment.observerSignedAt || assessment.observeeSignedAt) return "Awaiting acknowledgement";
  return "In progress";
}

async function observationRows(db: Db, cycleId: string) {
  const cycle = await cycleOrThrow(db, cycleId);
  const observations = await db.observation.findMany({
    where: { cycleId: cycle.cycleId },
    include: {
      signup: { include: { professor: { include: { user: true } }, section: { include: { course: true } } } },
      observer: { include: { user: true } }, signedAssessment: true,
    },
    orderBy: { observationId: "asc" },
  });
  return observations.map(observation => ({
    id: observation.observationId,
    observee: userResponse(observation.signup.professor.user),
    observer: observation.observer ? userResponse(observation.observer.user) : null,
    course: { code: observation.signup.section.course.courseCode, title: observation.signup.section.course.courseTitle },
    section: { course: { code: observation.signup.section.course.courseCode, title: observation.signup.section.course.courseTitle } },
    status: observationStatus(observation, cycle.observationDeadline),
    assessmentStatus: assessmentStatus(observation.signedAssessment),
    departmentId: observation.signup.section.course.departmentId,
  }));
}

export async function getObservations(db: Db, cycleId: string, url: URL) {
  const { limit, cursor } = pagination(url);
  const status = url.searchParams.get("status");
  const assessment = url.searchParams.get("assessmentStatus");
  if (status && !["in-progress", "complete", "incomplete", "unmatched"].includes(status)) invalid("Invalid observation status.");
  let rows = await observationRows(db, cycleId);
  rows = rows.filter(row => (!cursor || row.id > cursor) && (!status || row.status === status) && (!assessment || row.assessmentStatus === assessment));
  return list(rows.map(row => ({ id: row.id, observee: row.observee, observer: row.observer,
    course: row.course, section: row.section, status: row.status, assessmentStatus: row.assessmentStatus })), limit);
}

export async function getReports(db: Db, cycleId: string) {
  const cycle = await cycleOrThrow(db, cycleId);
  const [faculty, observations, levels] = await Promise.all([
    allFacultyStatuses(db, cycleId), observationRows(db, cycleId), db.hiringLevel.findMany({ orderBy: { levelName: "asc" } }),
  ]);
  const due = faculty.filter(row => row.evaluationStatus === "due");
  const overdue = faculty.filter(row => row.evaluationStatus === "overdue");
  return {
    cycleId: cycle.cycleId, asOf: new Date().toISOString(), definitionsVersion: "database-operational-v1",
    summary: {
      facultyDue: due.length,
      overdue: overdue.length,
      unmatched: observations.filter(row => row.status === "unmatched").length,
      incomplete: observations.filter(row => row.status === "incomplete").length,
    },
    byHiringLevel: levels.map(level => {
      const relevant = faculty.filter(row => row.hiringLevel.id === level.hiringLevelId && ["due", "overdue"].includes(row.evaluationStatus));
      return { hiringLevelId: level.hiringLevelId, name: level.levelName, due: relevant.length,
        outstanding: relevant.filter(row => !row.observationId).length };
    }),
    availableViews: ["faculty-status", "attention", "observations"],
  };
}

export async function getAttention(db: Db, cycleId: string, url: URL) {
  const cycle = await cycleOrThrow(db, cycleId);
  const issue = url.searchParams.get("issue");
  const departmentId = url.searchParams.get("departmentId");
  if (issue && !["overdue", "unmatched", "incomplete", "alert", "expiredApproval"].includes(issue)) invalid("Invalid attention issue.");
  if (departmentId) uuid(departmentId);
  const [faculty, observations] = await Promise.all([allFacultyStatuses(db, cycleId), observationRows(db, cycleId)]);
  const items = [
    ...faculty.filter(row => row.evaluationStatus === "overdue" && (!departmentId || row.departmentId === departmentId)).map(row => ({
      id: `overdue:${row.id}`, faculty: row.professor, issue: "overdue" as const,
      observationStatus: row.observationId ? "Evaluation outstanding" : "Not signed up",
      observationId: row.observationId, createdAt: cycle.signupDeadline.toISOString(), allowedActions: row.observationId ? ["review"] : [],
    })),
    ...observations.filter(row => ["unmatched", "incomplete"].includes(row.status) && (!departmentId || row.departmentId === departmentId)).map(row => ({
      id: `${row.status}:${row.id}`, faculty: row.observee,
      issue: row.status as "unmatched" | "incomplete", observationStatus: row.status,
      observationId: row.id, createdAt: cycle.observationDeadline.toISOString(), allowedActions: ["review"],
    })),
  ].filter(item => !issue || item.issue === issue);
  return { items, pageInfo: { nextCursor: null, hasMore: false } };
}

export async function getMetrics(db: Db, cycleId: string) {
  const cycle = await cycleOrThrow(db, cycleId);
  const observations = await observationRows(db, cycleId);
  const unavailableReason = "The project has not approved this KPI formula and denominator.";
  return {
    cycleId: cycle.cycleId, available: false, availableAt: cycle.feedbackDeadline.toISOString(),
    generatedAt: new Date().toISOString(), formulaVersion: null,
    metrics: [
      { key: "participationRate", label: "Participation rate", value: null, unit: "%", unavailableReason },
      { key: "observerUtilizationRate", label: "Observer utilization", value: null, unit: "%", unavailableReason },
      { key: "listSufficiencyRate", label: "List sufficiency", value: null, unit: "%", unavailableReason },
      { key: "incompleteObservations", label: "Incomplete observations", value: observations.filter(row => row.status === "incomplete").length, unit: "count" },
    ],
  };
}

function zonedTimestamp(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(guess)).reduce<Record<string, string>>((values, part) => ({ ...values, [part.type]: part.value }), {});
  const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (represented - guess)).toISOString();
}

async function signupRecords(db: Db, cycleId: string) {
  await cycleOrThrow(db, cycleId);
  return db.evaluationSignup.findMany({
    where: { cycleId },
    include: {
      professor: { include: { user: true } },
      section: { include: { course: true, semester: true, classMeetings: true } },
      observations: { include: { timeOptions: true } },
    },
    orderBy: { signupId: "asc" },
  });
}

type MeetingSignup = {
  sectionId: string;
  section: {
    semester: { timeZone: string };
    classMeetings: Array<{ meetingId: string; dayOfWeek: string; startTime: string; endTime: string; location: string | null }>;
  };
};
type MeetingObservation = { timeOptions: Array<{ timeOptionId: string; preferredDate: Date }> };

function proposedMeetings(signup: MeetingSignup, observation: MeetingObservation) {
  return observation.timeOptions.flatMap(option => {
    const date = option.preferredDate.toISOString().slice(0, 10);
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(option.preferredDate);
    return signup.section.classMeetings.filter(meeting => meeting.dayOfWeek === weekday).map((meeting, index) => ({
      id: index === 0 ? option.timeOptionId : `${option.timeOptionId}:${meeting.meetingId}`,
      sectionId: signup.sectionId, date,
      startsAt: zonedTimestamp(date, meeting.startTime, signup.section.semester.timeZone),
      endsAt: zonedTimestamp(date, meeting.endTime, signup.section.semester.timeZone),
      timeZone: signup.section.semester.timeZone, location: meeting.location,
    }));
  });
}

export async function getSignups(db: Db, cycleId: string, url: URL) {
  const { limit, cursor } = pagination(url);
  const records = await signupRecords(db, cycleId);
  const rows = records.flatMap(signup => signup.observations.map(observation => ({
    id: signup.signupId,
    signupId: signup.signupId, observationId: observation.observationId,
    observee: userResponse(signup.professor.user),
    section: { id: signup.sectionId, sectionNumber: signup.section.sectionCode, semesterId: signup.section.semesterId,
      course: { id: signup.section.courseId, code: signup.section.course.courseCode, title: signup.section.course.courseTitle,
        departmentId: signup.section.course.departmentId, level: signup.section.course.courseLevel } },
    proposedMeetings: proposedMeetings(signup, observation), signedUpAt: signup.signupDate.toISOString(),
  }))).filter(row => !cursor || row.id > cursor);
  return list(rows, limit);
}

async function observationRecord(db: Db, observationId: string) {
  const observation = await db.observation.findUnique({
    where: { observationId: uuid(observationId) },
    include: {
      cycle: true,
      signup: { include: { professor: { include: { user: true } }, section: { include: { course: true, semester: true, classMeetings: true } } } },
      observer: { include: { user: true } }, candidates: true, timeOptions: true, signedAssessment: true,
    },
  });
  if (!observation) throw new ConfigurationError(404, "NOT_FOUND", "Observation not found.");
  return observation;
}

export async function getObservation(db: Db, observationId: string) {
  const observation = await observationRecord(db, observationId);
  const signupShape = { ...observation.signup, observations: [{ observationId: observation.observationId, timeOptions: observation.timeOptions }] };
  const options = proposedMeetings(signupShape, signupShape.observations[0]);
  const scheduled = observation.scheduledAt ? (() => {
    const date = observation.scheduledAt!.toISOString().slice(0, 10);
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(observation.scheduledAt!);
    const classMeeting = observation.signup.section.classMeetings.find(meeting => meeting.dayOfWeek === weekday);
    return {
      id: `scheduled:${observation.observationId}`, sectionId: observation.signup.sectionId, date,
      startsAt: observation.scheduledAt!.toISOString(),
      endsAt: classMeeting ? zonedTimestamp(date, classMeeting.endTime, observation.signup.section.semester.timeZone) : observation.scheduledAt!.toISOString(),
      timeZone: observation.signup.section.semester.timeZone, location: classMeeting?.location ?? null,
    };
  })() : null;
  const status = observationStatus(observation, observation.cycle.observationDeadline);
  const progress = [
    { key: "signup", label: "Faculty signup", state: "complete", completedAt: observation.signup.signupDate.toISOString() },
    { key: "recommendations", label: "Observer recommendations", state: observation.candidates.length ? "complete" : "pending" },
    { key: "observer", label: "Observer selected", state: observation.observerId ? "complete" : "pending" },
    { key: "scheduled", label: "Observation scheduled", state: observation.scheduledAt ? "complete" : "pending", completedAt: observation.scheduledAt?.toISOString() },
    { key: "observation", label: "Classroom observation", state: observation.completedAt ? "complete" : "pending", completedAt: observation.completedAt?.toISOString() },
    { key: "assessment", label: "Assessment", state: observation.signedAssessment?.completedAt ? "complete" : "pending", completedAt: observation.signedAssessment?.completedAt?.toISOString() },
  ];
  return {
    observation: {
      id: observation.observationId,
      observee: userResponse(observation.signup.professor.user),
      observer: observation.observer ? userResponse(observation.observer.user) : null,
      course: { code: observation.signup.section.course.courseCode, title: observation.signup.section.course.courseTitle },
      status, assessmentStatus: assessmentStatus(observation.signedAssessment), scheduledMeeting: scheduled,
    },
    proposedMeetings: options, progress, pendingAlert: null,
    templateVersionId: observation.signedAssessment?.templateId ?? null,
  };
}

export async function getCandidates(db: Db, observationId: string) {
  const observation = await observationRecord(db, observationId);
  const signupShape = { ...observation.signup, observations: [{ observationId: observation.observationId, timeOptions: observation.timeOptions }] };
  const meetings = proposedMeetings(signupShape, signupShape.observations[0]);
  const candidates = await db.observationCandidate.findMany({
    where: { observationId: observation.observationId },
    include: { professor: { include: { user: true, teaches: { include: { section: { include: { course: true, semester: true } } } } } } },
    orderBy: { candidateId: "asc" },
  });
  const releasedAt = candidates.map(candidate => candidate.invitedAt).filter((value): value is Date => value !== null).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return {
    observationId: observation.observationId, releasedAt: releasedAt?.toISOString() ?? null,
    proposedMeetings: meetings,
    items: candidates.map(candidate => ({
      id: candidate.candidateId, observationId: observation.observationId,
      professor: userResponse(candidate.professor.user),
      availableMeetingOptionIds: meetings.map(meeting => meeting.id), responseStatus: candidate.status,
      courseHistory: candidate.professor.teaches.slice(0, 3).map(teaching => `${teaching.section.course.courseCode} · ${teaching.section.semester.termName}`).join(", ") || null,
    })),
    pageInfo: { nextCursor: null, hasMore: false },
  };
}

function templateResponse(template: {
  templateId: string; templateName: string; commentPrompts: unknown; signatureLabels: unknown;
  criteria: Array<{ criterionId: string; criterionKey: string; criterionText: string; questionType: string;
    isRequired: boolean; displayOrder: number; options: unknown; weight: number }>;
} | null) {
  if (!template) throw new ConfigurationError(404, "NOT_FOUND", "Assigned observation template not found.");
  return {
    id: template.templateId, title: template.templateName,
    criteria: template.criteria.map(item => ({ id: item.criterionId, key: item.criterionKey, prompt: item.criterionText,
      type: item.questionType.toLowerCase(), required: item.isRequired, order: item.displayOrder,
      ...(item.options === null ? {} : { options: item.options }), weight: item.weight })),
    commentPrompts: template.commentPrompts, signatureLabels: template.signatureLabels,
  };
}

export async function getObservationTemplate(db: Db, observationId: string) {
  const observation = await db.observation.findUnique({ where: { observationId: uuid(observationId) }, select: { signedAssessment: { select: { templateId: true } } } });
  if (!observation) throw new ConfigurationError(404, "NOT_FOUND", "Observation not found.");
  if (!observation.signedAssessment) throw new ConfigurationError(404, "NOT_FOUND", "No assessment template is assigned to this observation.");
  const template = await db.observationTemplate.findUnique({ where: { templateId: observation.signedAssessment.templateId }, include: { criteria: { orderBy: { displayOrder: "asc" } } } });
  return templateResponse(template);
}

export async function getObservationAssessment(db: Db, observationId: string) {
  const observation = await db.observation.findUnique({
    where: { observationId: uuid(observationId) },
    include: { signup: { include: { professor: true } }, observer: true, signedAssessment: true },
  });
  if (!observation) throw new ConfigurationError(404, "NOT_FOUND", "Observation not found.");
  const assessment = observation.signedAssessment;
  if (!assessment) return { observationId: observation.observationId, templateVersionId: null, assessment: null, allowedActions: [] };
  const stored = assessment.responses && typeof assessment.responses === "object" && !Array.isArray(assessment.responses)
    ? assessment.responses as Record<string, unknown> : {};
  const answers = Array.isArray(stored.answers) ? stored.answers : [];
  const comments = Array.isArray(stored.comments) ? stored.comments : [];
  const acknowledgements = [
    ...(assessment.observerSignedAt && observation.observer ? [{ actorId: observation.observer.userId, participantRole: "observer", acknowledgedAt: assessment.observerSignedAt.toISOString() }] : []),
    ...(assessment.observeeSignedAt ? [{ actorId: observation.signup.professor.userId, participantRole: "observee", acknowledgedAt: assessment.observeeSignedAt.toISOString() }] : []),
  ];
  return {
    observationId: observation.observationId, templateVersionId: assessment.templateId,
    assessment: {
      id: assessment.assessmentId, observationId: observation.observationId, templateVersionId: assessment.templateId,
      status: assessment.isLocked || assessment.completedAt ? "complete" : "in-progress", revision: 0,
      answers, comments, submittedAt: assessment.completedAt?.toISOString() ?? null, acknowledgements, allowedActions: [],
    },
    allowedActions: [],
  };
}
