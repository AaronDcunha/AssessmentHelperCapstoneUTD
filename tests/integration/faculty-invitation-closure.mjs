// Real services/outbox trigger in a disposable local database; application data is untouched.
import '../../scripts/server-loader.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { facultyPermissions } from '../../prisma/seed-data.mjs';
import { recommendationFixture } from '../recommendation-fixtures.mjs';

const { PrismaClient } = await import('../../src/generated/prisma/client.ts');
const service = await import('../../src/server/services/faculty-invitations.ts');
const { getFacultyLinks } = await import('../../src/server/queries/faculty-links.ts');
const appUrl = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(appUrl.hostname), 'Local PostgreSQL required');
appUrl.searchParams.delete('schema');
const databaseName = `invitation_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(appUrl); testUrl.pathname = `/${databaseName}`;
const admin = new pg.Pool({ connectionString: appUrl.toString(), connectionTimeoutMillis: 5000 });
const pool = new pg.Pool({ connectionString: testUrl.toString(), connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl.toString() }) });
const previousPrisma = globalThis.configurationPrisma;
globalThis.configurationPrisma = db;
const now = new Date(), day = 86400000;
const users = Array.from({ length: 12 }, (_, i) => ({ id: randomUUID(), professorId: randomUUID(), name: `Invitation ${i}`, permissions: [...facultyPermissions] }));
const [observee, selected] = users;
const departmentId = randomUUID(), levelId = randomUUID(), semesterId = randomUUID(), cycleId = randomUUID(), courseId = randomUUID();
const meetingDate = offset => new Date(now.getTime() + offset * day).toISOString().slice(0, 10);
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${meetingDate(7)}T12:00:00Z`));
let signup, created = false;

async function fixture(specs, offset = 7) {
  const observation = await db.observation.create({ data: { signupId: signup.signupId, cycleId,
    timeOptions: { create: { preferredDate: new Date(`${meetingDate(offset)}T00:00:00Z`) } } }, include: { timeOptions: true } });
  const list = await recommendationFixture(db, observation.observationId, { released: true });
  const optionId = observation.timeOptions[0].timeOptionId, members = [];
  for (const spec of specs) {
    const status = spec.status ?? 'PENDING', invitedAt = spec.invited === false ? null : new Date(now.getTime() - day);
    const expiresAt = invitedAt ? new Date(now.getTime() + (spec.elapsed ? -1000 : day)) : null;
    const respondedAt = ['ACCEPTED', 'DECLINED'].includes(status) ? now : null;
    const cancelledAt = spec.cancelled ? new Date(now.getTime() - 5000) : null;
    const acceptedOptionId = status === 'ACCEPTED' ? optionId : null;
    const candidate = await db.observationCandidate.create({ data: { observationId: observation.observationId,
      recommendationListId: list.listId, professorId: users[spec.user].professorId, status, invitedAt, expiresAt, respondedAt, cancelledAt, acceptedOptionId } });
    const attempt = invitedAt ? await db.invitationAttempt.create({ data: { candidateId: candidate.candidateId, number: 1, status, invitedAt, expiresAt, respondedAt, cancelledAt, acceptedOptionId } }) : null;
    members.push({ ...candidate, attempt, user: users[spec.user] });
  }
  return { observation, list, optionId, members };
}
const payload = member => ({ candidateId: member.candidateId, attemptId: member.attempt.attemptId });
const snapshot = async () => JSON.stringify(await Promise.all([
  db.observation.findMany({ orderBy: { observationId: 'asc' } }),
  db.observationCandidate.findMany({ orderBy: { candidateId: 'asc' } }),
  db.invitationAttempt.findMany({ orderBy: { attemptId: 'asc' } }),
  db.lateAcceptanceApproval.findMany({ orderBy: { approvalId: 'asc' } }),
  db.notification.findMany({ orderBy: { notificationId: 'asc' }, include: { emailDelivery: true } }),
]));
async function failAfterNotification(action) {
  globalThis.configurationPrisma = new Proxy(db, { get(target, key) {
    if (key !== '$transaction') return target[key];
    return (run, options) => db.$transaction(tx => run(new Proxy(tx, { get(transaction, model) {
      if (model !== 'notification') return transaction[model];
      return { ...transaction.notification, upsert: async args => {
        await transaction.notification.upsert(args); // INSERT and email outbox trigger have run.
        throw new Error('Injected notification failure');
      } };
    } })), options);
  } });
  try { await assert.rejects(action(), /Injected notification failure/); }
  finally { globalThis.configurationPrisma = db; }
}
async function assertEvent(eventKey, recipientIds, observationId) {
  const rows = await db.notification.findMany({ where: { eventKey }, include: { emailDelivery: true } });
  assert.deepEqual(rows.map(row => row.userId).sort(), [...recipientIds].sort());
  for (const row of rows) {
    if (eventKey.startsWith('invitation-closed:')) assert.equal(row.message, 'Thank you for your time and willingness to participate in this observation. Another observer has been selected, so your invitation is now closed. No further action is needed.');
    assert.equal(row.targetId, observationId); assert.equal(row.targetKind, 'observation');
    assert.equal(row.emailRequested, true); assert.equal(row.inAppEnabled, true);
    assert.equal(row.emailDelivery?.status, 'pending');
  }
  assert.equal(await db.notificationEmail.count({ where: { notification: { eventKey } } }), recipientIds.length);
  return rows;
}
const conflict = error => error.status === 409;
try {
  await admin.query(`CREATE DATABASE "${databaseName}"`); created = true;
  for (const name of (await readdir(new URL('../../prisma/migrations/', import.meta.url), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
    await pool.query(await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8'));
  }
  await db.appUser.createMany({ data: users.map((user, i) => ({ userId: user.id, fullName: user.name, email: `invitation${i}@test.invalid` })) });
  await db.department.create({ data: { departmentId, departmentName: 'Invitation tests' } });
  await db.hiringLevel.create({ data: { hiringLevelId: levelId, levelName: 'Assistant Professor', evaluationIntervalYears: 1 } });
  await db.semester.create({ data: { semesterId, termCode: `${String(now.getUTCFullYear()).slice(2)}f`, termName: 'Invitation tests', startsOn: new Date(now.getTime() - 30 * day), endsOn: new Date(now.getTime() + 60 * day), timeZone: 'America/Chicago' } });
  await db.evaluationCycle.create({ data: { cycleId, semesterId, cycleName: 'Invitation tests', signupDeadline: new Date(now.getTime() - day), observationDeadline: new Date(now.getTime() + 30 * day), feedbackDeadline: new Date(now.getTime() + 40 * day) } });
  await db.course.create({ data: { courseId, departmentId, courseCode: 'TEST4000', courseTitle: 'Invitation tests', courseLevel: 4000 } });
  for (const [i, user] of users.entries()) {
    await db.professor.create({ data: { professorId: user.professorId, userId: user.id, departmentId, hiringLevelId: levelId } });
    const section = await db.courseSection.create({ data: { courseId, semesterId, sectionCode: String(i), teaches: { create: { professorId: user.professorId } },
      classMeetings: { create: { dayOfWeek: weekday, startTime: i ? '14:00' : '10:00', endTime: i ? '15:00' : '11:00', location: 'Test room' } } } });
    if (!i) signup = await db.evaluationSignup.create({ data: { cycleId, professorId: user.professorId, sectionId: section.sectionId } });
  }

  const declined = await fixture([{ user: 2 }]);
  const member = declined.members[0], declineKey = `invitation-declined:${member.attempt.attemptId}`;
  await assert.rejects(service.declineFacultyInvitation(selected, payload(member)), error => error.status === 403);
  const beforeDecline = await snapshot();
  await failAfterNotification(() => service.declineFacultyInvitation(member.user, payload(member)));
  assert.equal(await snapshot(), beforeDecline, 'Decline rollback includes revision, response and outbox');
  const declines = await Promise.allSettled([0, 1].map(() => service.declineFacultyInvitation(member.user, payload(member))));
  assert.equal(declines.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(declines.filter(result => result.status === 'rejected').every(result => conflict(result.reason)));
  const declinedCandidate = await db.observationCandidate.findUniqueOrThrow({ where: { candidateId: member.candidateId } });
  const declinedAttempt = await db.invitationAttempt.findUniqueOrThrow({ where: { attemptId: member.attempt.attemptId } });
  assert.equal(declinedCandidate.status, 'DECLINED'); assert.equal(declinedAttempt.status, 'DECLINED');
  assert.deepEqual(declinedCandidate.respondedAt, declinedAttempt.respondedAt);
  const declineRows = await assertEvent(declineKey, [observee.id], declined.observation.observationId);
  assert.match(declineRows[0].message, /review your remaining observer options/i);
  assert.equal((await getFacultyLinks(observee, cycleId)).recommendations.find(row => row.id === member.candidateId).status, 'DECLINED');
  assert.ok(!(await getFacultyLinks(member.user, cycleId)).requests.some(row => row.id === member.candidateId));
  await assert.rejects(service.declineFacultyInvitation(member.user, payload(member)), conflict);
  await assert.rejects(service.acceptFacultyInvitation(member.user, { ...payload(member), meetingOptionId: declined.optionId }), conflict);
  await assertEvent(declineKey, [observee.id], declined.observation.observationId);
  console.log('PASS decline ownership, atomic rollback, concurrent retries, read status, stale actions and one notification/outbox');

  // Synthetic audience matrix includes inconsistent legacy rows to exercise exclusions.
  const closure = await fixture([
    { user: 1, status: 'ACCEPTED' }, { user: 2 }, { user: 3, status: 'ACCEPTED' }, { user: 4, elapsed: true },
    { user: 5, status: 'DECLINED' }, { user: 6, status: 'EXPIRED', elapsed: true },
    { user: 7, status: 'ELIGIBLE', invited: false }, { user: 8, invited: false },
    { user: 9, cancelled: true }, { user: 10, status: 'ACCEPTED', cancelled: true }, { user: 11, status: 'ELIGIBLE' },
  ]);
  const [winner, pending, accepted, elapsed, declinedOther, expired, eligible, neverInvited, cancelledPending, cancelledAccepted] = closure.members;
  const historyList = await db.recommendationList.create({ data: { observationId: closure.observation.observationId, publishedAt: now } });
  const historical = await db.observationCandidate.create({ data: { observationId: closure.observation.observationId, recommendationListId: historyList.listId, professorId: users[5].professorId, status: 'PENDING', invitedAt: now } });
  const approval = await db.lateAcceptanceApproval.create({ data: { attemptId: expired.attempt.attemptId } });
  await assert.rejects(service.acceptFacultyInvitation(elapsed.user, { ...payload(elapsed), meetingOptionId: closure.optionId }), conflict);
  await assert.rejects(service.declineFacultyInvitation(elapsed.user, payload(elapsed)), conflict);
  const beforeSelection = await snapshot();
  await failAfterNotification(() => service.selectFacultyObserver(observee, { candidateId: winner.candidateId }));
  assert.equal(await snapshot(), beforeSelection, 'Selection rollback restores assignment, all cancellations and outbox');
  await service.selectFacultyObserver(observee, { candidateId: winner.candidateId });
  const closureKey = `invitation-closed:${winner.candidateId}`;
  await assertEvent(closureKey, [pending.user.id, accepted.user.id, elapsed.user.id], closure.observation.observationId);
  await assertEvent(`appointment-confirmed:${winner.candidateId}`, [selected.id, observee.id], closure.observation.observationId);
  for (const other of [pending, accepted, elapsed, expired, eligible, neverInvited]) {
    const row = await db.observationCandidate.findUniqueOrThrow({ where: { candidateId: other.candidateId } });
    assert.equal(row.status, 'CANCELLED'); assert.ok(row.cancelledAt);
  }
  for (const other of [accepted, cancelledAccepted]) {
    const attempt = await db.invitationAttempt.findUniqueOrThrow({ where: { attemptId: other.attempt.attemptId } });
    assert.equal(attempt.status, 'ACCEPTED'); assert.deepEqual(attempt.respondedAt, other.attempt.respondedAt);
    assert.equal(attempt.acceptedOptionId, closure.optionId); assert.ok(attempt.cancelledAt);
  }
  for (const other of [cancelledPending, cancelledAccepted]) {
    assert.deepEqual((await db.observationCandidate.findUniqueOrThrow({ where: { candidateId: other.candidateId } })).cancelledAt, other.cancelledAt);
  }
  assert.deepEqual(await db.lateAcceptanceApproval.findUnique({ where: { approvalId: approval.approvalId } }), approval);
  assert.equal((await db.observationCandidate.findUniqueOrThrow({ where: { candidateId: declinedOther.candidateId } })).status, 'DECLINED');
  assert.deepEqual(await db.observationCandidate.findUnique({ where: { candidateId: historical.candidateId } }), historical);
  for (const other of [pending, accepted, elapsed, expired, cancelledPending]) {
    await assert.rejects(service.declineFacultyInvitation(other.user, payload(other)), conflict);
    await assert.rejects(service.acceptFacultyInvitation(other.user, { ...payload(other), meetingOptionId: closure.optionId }), conflict);
    assert.ok(!(await getFacultyLinks(other.user, cycleId)).requests.some(row => row.id === other.candidateId));
  }
  await assert.rejects(service.requestLateAcceptance(expired.user, payload(expired)), conflict);
  await assert.rejects(service.reviewLateAcceptance({ id: observee.id, permissions: ['late-acceptance.review'] }, approval.approvalId, { decision: 'approved' }), conflict);
  const notificationsBeforeRetry = await db.notification.count(), emailsBeforeRetry = await db.notificationEmail.count();
  await service.selectFacultyObserver(observee, { candidateId: winner.candidateId });
  assert.equal(await db.notification.count(), notificationsBeforeRetry); assert.equal(await db.notificationEmail.count(), emailsBeforeRetry);
  console.log('PASS exact pre-cancellation closure audience, recorded elapsed PENDING, broad closure, response/approval history and retry deduplication');

  const race = await fixture([{ user: 1, status: 'ACCEPTED' }, { user: 3, status: 'ACCEPTED' }, { user: 2 }], 14);
  const selections = await Promise.allSettled(race.members.slice(0, 2).map(candidate => service.selectFacultyObserver(observee, { candidateId: candidate.candidateId })));
  assert.equal(selections.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(selections.filter(result => result.status === 'rejected').every(result => conflict(result.reason)));
  assert.equal(await db.observationCandidate.count({ where: { observationId: race.observation.observationId, status: 'SELECTED' } }), 1);
  const raceWinner = await db.observationCandidate.findFirstOrThrow({ where: { observationId: race.observation.observationId, status: 'SELECTED' } });
  await assertEvent(`invitation-closed:${raceWinner.candidateId}`, race.members.filter(row => row.candidateId !== raceWinner.candidateId).map(row => row.user.id), race.observation.observationId);
  const responseRace = await fixture([{ user: 2 }], 21), responder = responseRace.members[0];
  const responses = await Promise.allSettled([
    service.declineFacultyInvitation(responder.user, payload(responder)),
    service.acceptFacultyInvitation(responder.user, { ...payload(responder), meetingOptionId: responseRace.optionId }),
  ]);
  assert.equal(responses.filter(result => result.status === 'fulfilled').length, 1);
  assert.ok(responses.filter(result => result.status === 'rejected').every(result => conflict(result.reason)));
  const response = await db.invitationAttempt.findUniqueOrThrow({ where: { attemptId: responder.attempt.attemptId } });
  assert.equal((await db.observationCandidate.findUniqueOrThrow({ where: { candidateId: responder.candidateId } })).status, response.status);
  const responseKey = `invitation-${response.status === 'DECLINED' ? 'declined' : 'accepted'}:${response.attemptId}`;
  await assertEvent(responseKey, [observee.id], responseRace.observation.observationId);
  assert.equal(await db.notification.count({ where: { targetId: responseRace.observation.observationId } }), 1);
  const closureRace = await fixture([{ user: 1, status: 'ACCEPTED' }, { user: 2 }], 21);
  const [raceSelection, raceDecline] = closureRace.members;
  const competing = await Promise.allSettled([
    service.selectFacultyObserver(observee, { candidateId: raceSelection.candidateId }),
    service.declineFacultyInvitation(raceDecline.user, payload(raceDecline)),
  ]);
  assert.ok(competing.some(result => result.status === 'fulfilled'));
  assert.ok(competing.filter(result => result.status === 'rejected').every(result => conflict(result.reason)));
  // If decline commits first, retry selection using the same candidate identity.
  await service.selectFacultyObserver(observee, { candidateId: raceSelection.candidateId });
  const lastResponse = await db.invitationAttempt.findUniqueOrThrow({ where: { attemptId: raceDecline.attempt.attemptId } });
  const didDecline = lastResponse.status === 'DECLINED';
  await assertEvent(`invitation-closed:${raceSelection.candidateId}`, didDecline ? [] : [raceDecline.user.id], closureRace.observation.observationId);
  await assertEvent(`invitation-declined:${raceDecline.attempt.attemptId}`, didDecline ? [observee.id] : [], closureRace.observation.observationId);
  console.log('PASS concurrent final selections, accept/decline and select/decline preserve one consistent outcome and exact notification/outbox counts');
} finally {
  globalThis.configurationPrisma = previousPrisma;
  await db.$disconnect(); await pool.end();
  if (created) {
    assert.match(databaseName, /^invitation_test_[a-f0-9]{32}$/);
    assert.notEqual(databaseName, decodeURIComponent(appUrl.pathname.slice(1)));
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  }
  await admin.end();
}
