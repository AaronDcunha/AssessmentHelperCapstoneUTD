import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import type { AccountUser } from "../account-auth";
import { getPrisma } from "../prisma";
import { availableOption, observerAvailable, workflowObservation } from "../services/faculty-invitations";
import { FacultyActionError } from "../services/faculty-errors";
import { currentReleasedCandidates } from "../recommendation-scope";

export async function getFacultyLinks(user: AccountUser, cycleId: string, now = new Date(), db: Prisma.TransactionClient = getPrisma()) {
  const own = user.permissions.includes("recommendations.read.released.own") ? await db.observation.findMany({
    where: { cycleId, signup: { professor: { userId: user.id } }, observerId: null, completedAt: null, status: "PENDING" },
    include: { currentReleasedList: { include: { candidates: { include: { professor: { include: { user: true } }, acceptedOption: true }, orderBy: { candidateId: "asc" } } } }, timeOptions: true },
  }) : [];
  const recommendations = own.flatMap(record => !record.currentReleasedList?.publishedAt ? [] : record.currentReleasedList.candidates.map(candidate => ({
    id: candidate.candidateId, observationId: record.observationId, name: candidate.professor.user.fullName, status: candidate.status,
    acceptedDate: candidate.acceptedOption?.preferredDate.toISOString().slice(0, 10) ?? null,
    acceptedMeeting: candidate.acceptedOption?.startsAt && candidate.acceptedOption.endsAt && candidate.acceptedOption.timeZone ? { startsAt: candidate.acceptedOption.startsAt.toISOString(), endsAt: candidate.acceptedOption.endsAt.toISOString(), timeZone: candidate.acceptedOption.timeZone } : null,
    dates: record.timeOptions.map(option => option.preferredDate.toISOString().slice(0, 10)),
  })));
  const received = user.permissions.includes("observations.read.own") ? await db.observationCandidate.findMany({
    where: { ...currentReleasedCandidates, professor: { userId: user.id }, invitedAt: { not: null }, status: { in: ["PENDING", "EXPIRED", "ACCEPTED"] },
      observation: { cycleId, observerId: null, completedAt: null, status: "PENDING", cycle: { observationDeadline: { gt: now } } } },
    include: { attempts: { orderBy: { number: "desc" }, take: 1, include: { approval: true } },
      observation: { include: { signup: { include: { professor: { include: { user: true } }, section: { include: { course: true, classMeetings: true } } } }, timeOptions: true } } },
    orderBy: { candidateId: "asc" },
  }) : [];
  const requestGroups = await Promise.all(received.map(async candidate => {
    const attempt = candidate.attempts[0]; if (!attempt) return [];
    const record = candidate.observation, section = record.signup.section;
    const full = await workflowObservation(db, record.observationId);
    const options = [];
    for (const proposal of record.timeOptions) {
      try {
        const option = availableOption(full, proposal.timeOptionId, now);
        if (!await observerAvailable(db, full, candidate.professorId, option)) continue;
        const format = new Intl.DateTimeFormat("en-US", { timeZone: option.timeZone, timeStyle: "short" });
        options.push({ id: proposal.timeOptionId, date: option.date, meetingTime: `${format.format(option.startsAt)}–${format.format(option.endsAt)} · ${option.timeZone}` });
      } catch (error) { if (!(error instanceof FacultyActionError)) throw error; }
    }
    return [{ id: candidate.candidateId, attemptId: attempt.attemptId, status: candidate.status,
      expired: attempt.expiresAt <= now, approvalStatus: attempt.approval?.status ?? null,
      observee: record.signup.professor.user.fullName, course: section.course.courseCode, section: section.sectionCode,
      expiresAt: attempt.expiresAt.toISOString(), options }];
  }));
  const requests = requestGroups.flat();
  const feedback = user.permissions.includes("feedback.read.own") || user.permissions.includes("feedback.submit.own") ? await db.observation.findMany({
    where: { cycleId, OR: [{ signup: { professor: { userId: user.id } } }, { observer: { userId: user.id } }] },
    include: { signup: { include: { professor: true, section: { include: { course: true } } } }, processFeedback: { where: { professor: { userId: user.id } }, include: { attachments: { where: { ownerId: user.id } } } }, cycle: true },
  }) : [];
  return { allowedActions: { invite: user.permissions.includes("invitations.send.own"), select: user.permissions.includes("observer.select.own"), respond: user.permissions.includes("invitations.respond.own"), lateAcceptance: user.permissions.includes("late-acceptance.request.own"), feedback: user.permissions.includes("feedback.submit.own") }, recommendations, requests, feedback: feedback.map(record => ({ observationId: record.observationId,
    label: `${record.signup.section.course.courseCode}.${record.signup.section.sectionCode}`,
    submitted: record.processFeedback.length > 0, allowed: record.cycle.observationDeadline < now && record.cycle.feedbackDeadline >= now,
    role: record.signup.professor.userId === user.id ? "observee" : "observer",
    attachments: record.processFeedback.flatMap(feedback => feedback.attachments.map(attachment => ({ id: attachment.attachmentId, name: attachment.originalName }))) })) };
}
export type FacultyLinks = Awaited<ReturnType<typeof getFacultyLinks>>;
