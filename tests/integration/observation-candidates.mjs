// All fixtures/migrations are confined to a disposable local schema. Candidate
// queries themselves run in PostgreSQL READ ONLY transactions.
import '../../scripts/server-loader.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { recommendationFixture } from '../recommendation-fixtures.mjs';
const { PrismaClient } = await import('../../src/generated/prisma/client.ts');
const { getObservationCandidates } = await import('../../src/server/queries/observation-candidates.ts');
const connectionUrl = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(connectionUrl.hostname), 'Use local PostgreSQL.');
connectionUrl.searchParams.delete('schema');
const schema = 'observation_candidates_test_' + randomUUID().replaceAll('-', '');
const admin = new pg.Pool({ connectionString: connectionUrl.toString(), connectionTimeoutMillis: 5000 });
const migration = new pg.Pool({ connectionString: connectionUrl.toString(), options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionUrl.toString() }, { schema }) });
const users = Array.from({ length: 8 }, () => randomUUID()), professors = users.map(() => randomUUID());
const departmentId = randomUUID(), hiringLevelId = randomUUID();
const semesters = Array.from({ length: 6 }, () => randomUUID()), cycles = [randomUUID(), randomUUID()];
const courses = [randomUUID(), randomUUID(), randomUUID()];
const sections = Array.from({ length: 6 }, () => randomUUID());
const actor = { id: randomUUID(), permissions: ['observations.read'] };
const now = new Date('2026-10-28T12:00:00Z');
const list = (observationId, query = '', user = actor) => db.$transaction(async tx => {
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  return getObservationCandidates(tx, user, observationId, new URL('http://local/candidates?' + query), now);
}, { isolationLevel: 'RepeatableRead', timeout: 20000 });
let created = false;
try {
  await admin.query(`CREATE SCHEMA ${schema}`); created = true;
  const root = new URL('../../prisma/migrations/', import.meta.url);
  for (const folder of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const sql = (await readFile(new URL(`${folder.name}/migration.sql`, root), 'utf8')).replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
    await migration.query(sql);
  }
  await db.appUser.createMany({ data: users.map((userId, i) => ({ userId, fullName: `Candidate fixture ${i}`, email: `candidate${i}@test.invalid` })) });
  await db.department.create({ data: { departmentId, departmentName: 'CS' } });
  await db.hiringLevel.create({ data: { hiringLevelId, levelName: 'Assistant', evaluationIntervalYears: 1 } });
  await db.professor.createMany({ data: professors.map((professorId, i) => ({ professorId, userId: users[i], departmentId, hiringLevelId })) });
  for (let i = 0; i < 2; i++) {
    await db.semester.create({ data: { semesterId: semesters[i], termCode: ['26f', '25f'][i], termName: ['Fall 2026', 'Fall 2025'][i],
      startsOn: new Date(i ? '2025-08-31' : '2026-08-31'), endsOn: new Date(i ? '2025-12-16' : '2026-12-16'), timeZone: 'America/Chicago' } });
    await db.evaluationCycle.create({ data: { cycleId: cycles[i], semesterId: semesters[i], cycleName: `Cycle ${i}`,
      signupDeadline: new Date('2026-10-31'), observationDeadline: new Date('2026-11-30'), feedbackDeadline: new Date('2026-12-07') } });
  }
  // Out-of-order terms and nullable boundaries ensure chronology uses stored
  // academic terms rather than UUIDs, labels, insertion order or boundary dates.
  for (const [i, termCode, termName] of [[2, '26s', 'Spring 2026'], [3, '24f', 'Fall 2024'], [4, '26u', 'Summer 2026'], [5, '25u', 'Summer 2025']]) {
    await db.semester.create({ data: { semesterId: semesters[i], termCode, termName } });
  }
  for (let i = 0; i < 3; i++) await db.course.create({ data: { courseId: courses[i], departmentId,
    courseCode: ['CS 4348', 'CS 4337', 'CS 2305'][i], courseTitle: `Relevant course ${i}`, courseLevel: i === 2 ? 2000 : 4000 } });
  for (let i = 0; i < 6; i++) await db.courseSection.create({ data: { sectionId: sections[i], semesterId: semesters[i === 5 ? 1 : 0],
    courseId: courses[i === 3 ? 1 : i === 4 ? 2 : 0], sectionCode: `00${i + 1}` } });
  // Target section meets Mon/Wed; candidate 2 teaches Mon at an overlapping time.
  for (const dayOfWeek of ['Monday', 'Wednesday']) await db.classMeeting.create({ data: { sectionId: sections[0], dayOfWeek, startTime: '10:00', endTime: '11:15', location: 'Current room' } });
  await db.classMeeting.create({ data: { sectionId: sections[2], dayOfWeek: 'Monday', startTime: '10:30', endTime: '12:00' } });
  for (let i = 1; i <= 6; i++) await db.teaches.create({ data: { professorId: professors[i], sectionId: i === 2 ? sections[2] : sections[1] } });
  // Same course/semester sections are deduplicated; older semesters are included
  // for display while wrong-level courses remain excluded.
  for (const sectionId of [sections[3], sections[4], sections[5]]) await db.teaches.create({ data: { professorId: professors[1], sectionId } });
  const extraSection = await db.courseSection.create({ data: { semesterId: semesters[0], courseId: courses[0], sectionCode: '007' } });
  await db.teaches.create({ data: { professorId: professors[1], sectionId: extraSection.sectionId } });
  for (const i of [3, 5, 2, 4]) {
    const historical = await db.courseSection.create({ data: { semesterId: semesters[i], courseId: courses[0], sectionCode: '001' } });
    await db.teaches.create({ data: { professorId: professors[1], sectionId: historical.sectionId } });
  }
  const repeatedSummer = await db.courseSection.create({ data: { semesterId: semesters[4], courseId: courses[0], sectionCode: '002' } });
  await db.teaches.create({ data: { professorId: professors[1], sectionId: repeatedSummer.sectionId } });
  // An existing candidate with only historical teaching must not acquire
  // current-semester compatibility simply because history is now displayed.
  await db.teaches.delete({ where: { professorId_sectionId: { professorId: professors[6], sectionId: sections[1] } } });
  await db.teaches.create({ data: { professorId: professors[6], sectionId: sections[5] } });
  const signups = [];
  for (let i = 0; i < 8; i++) signups.push(await db.evaluationSignup.create({ data: { cycleId: cycles[0], professorId: professors[i], sectionId: sections[0] } }));
  const generationId = randomUUID();
  const target = await db.observation.create({ data: { signupId: signups[0].signupId, cycleId: cycles[0], recommendationGenerationId: generationId, workflowRevision: 8 } });
  const appointment = await db.observation.create({ data: { signupId: signups[7].signupId, cycleId: cycles[0], observerId: professors[4], status: 'CONFIRMED',
    scheduledAt: new Date('2026-11-09T16:30:00Z'), scheduledEndsAt: new Date('2026-11-09T17:30:00Z') } });
  const foreignSignup = await db.evaluationSignup.create({ data: { cycleId: cycles[1], professorId: professors[0], sectionId: sections[5] } });
  const foreign = await db.observation.create({ data: { signupId: foreignSignup.signupId, cycleId: cycles[1] } });
  const targetList = await recommendationFixture(db, target.observationId, { generationId });
  const appointmentList = await recommendationFixture(db, appointment.observationId, { released: true });
  const foreignList = await recommendationFixture(db, foreign.observationId);
  const option = await db.observationTimeOption.create({ data: { observationId: target.observationId, preferredDate: new Date('2026-11-09'),
    startsAt: new Date('2026-11-09T16:00:00Z'), endsAt: new Date('2026-11-09T17:15:00Z'), timeZone: 'America/Chicago', location: 'Snapshot room' } });
  const legacy = await db.observationTimeOption.create({ data: { observationId: target.observationId, preferredDate: new Date('2026-11-11') } });
  const foreignOption = await db.observationTimeOption.create({ data: { observationId: foreign.observationId, preferredDate: new Date('2025-11-10') } });
  const candidates = [];
  const statuses = ['ACCEPTED', 'DECLINED', 'CANCELLED', 'PENDING', 'ELIGIBLE', 'EXPIRED'];
  for (let i = 0; i < statuses.length; i++) {
    const status = statuses[i], candidate = await db.observationCandidate.create({ data: {
      observationId: target.observationId, recommendationListId: targetList.listId, professorId: professors[i + 1], status,
      acceptedOptionId: status === 'ACCEPTED' ? option.timeOptionId : null,
    } });
    candidates.push(candidate);
    if (status !== 'ELIGIBLE') {
      if (i === 0) await db.invitationAttempt.create({ data: { candidateId: candidate.candidateId, number: 1, status: 'DECLINED',
        invitedAt: new Date('2026-10-18T10:00:00Z'), expiresAt: new Date('2026-10-20T10:00:00Z') } });
      await db.invitationAttempt.create({ data: { candidateId: candidate.candidateId, number: i === 0 ? 2 : 1, status,
        invitedAt: new Date('2026-10-20T10:00:00Z'), expiresAt: new Date('2026-10-22T10:00:00Z') } });
    }
  }
  const selected = await db.observationCandidate.create({ data: { observationId: appointment.observationId, recommendationListId: appointmentList.listId, professorId: professors[4], status: 'SELECTED' } });
  await db.invitationAttempt.create({ data: { candidateId: selected.candidateId, number: 1, status: 'ACCEPTED', invitedAt: new Date('2026-10-20T10:00:00Z'), expiresAt: new Date('2026-10-22T10:00:00Z') } });
  const foreignCandidate = await db.observationCandidate.create({ data: { observationId: foreign.observationId, recommendationListId: foreignList.listId, professorId: professors[1] } });
  const historicalList = await db.recommendationList.create({ data: { observationId: target.observationId, origin: 'LEGACY_IMPORT' } });
  const historicalCandidate = await db.observationCandidate.create({ data: { observationId: target.observationId, recommendationListId: historicalList.listId, professorId: professors[1] } });
  const fingerprint = async () => JSON.stringify(await Promise.all([
    db.observation.findMany({ orderBy: { observationId: 'asc' } }), db.observationCandidate.findMany({ orderBy: { candidateId: 'asc' } }),
    db.invitationAttempt.findMany({ orderBy: { attemptId: 'asc' } }), db.notification.count(), db.notificationEmail.count(), db.lateAcceptanceApproval.count(),
    db.recommendationList.findMany({ orderBy: { listId: 'asc' } }),
  ]));
  const before = await fingerprint();
  const all = await list(target.observationId);
  assert.equal(all.items.length, 6); // Read all persisted states, never regenerate/reselect five.
  assert.equal(all.currentDraftListId, targetList.listId); assert.equal(all.list.id, targetList.listId);
  assert.ok(!all.items.some(item=>item.id===historicalCandidate.candidateId));
  const historical = await list(target.observationId,'listId='+historicalList.listId);
  assert.deepEqual(historical.items.map(item=>item.id),[historicalCandidate.candidateId]);
  assert.equal(historical.list.generatedAt,null);
  await assert.rejects(list(target.observationId,'listId='+foreignList.listId),error=>error.status===404);
  await assert.rejects(list(target.observationId,'cursor='+historicalCandidate.candidateId),error=>error.status===400);
  assert.ok(all.items.every(item => item.observationId === target.observationId));
  assert.ok(!JSON.stringify(all).includes(foreignCandidate.candidateId)); assert.ok(!JSON.stringify(all).includes(foreignOption.timeOptionId));
  assert.equal(all.generationId, generationId); assert.equal(all.releasedAt, null); assert.equal(all.observationRevision, 8);
  const free = all.items.find(item => item.id === candidates[0].candidateId);
  assert.equal(free.professor.id, users[1]); assert.notEqual(free.professor.id, professors[1]);
  assert.deepEqual(free.availableMeetingOptionIds, [option.timeOptionId, legacy.timeOptionId]);
  assert.equal(free.responseStatus, 'ACCEPTED'); assert.equal(free.activeAttempt.sequence, 2);
  assert.equal(free.acceptedMeetingOptionId, option.timeOptionId); assert.equal(free.activeAttempt.acceptedMeetingOptionId, null);
  assert.deepEqual(free.courseHistory.map(item => [item.course.id, item.semester.id]), [
    [courses[1], semesters[0]], [courses[0], semesters[0]], // Same-term course-code tie break.
    [courses[0], semesters[4]], [courses[0], semesters[2]], [courses[0], semesters[1]],
  ]);
  assert.equal(free.courseHistory.length, 5); // Seven distinct pairs exist, plus duplicate sections.
  assert.ok(free.courseHistory.every(item => item.course.level === 4000));
  const historicalOnly = all.items.find(item => item.id === candidates[5].candidateId);
  assert.deepEqual(historicalOnly.courseHistory.map(item => item.semester.id), [semesters[1]]);
  assert.deepEqual(historicalOnly.availableMeetingOptionIds, []);
  assert.equal(all.proposedMeetings.find(item => item.id === legacy.timeOptionId).startsAt, null);
  assert.equal(all.proposedMeetings.find(item => item.id === legacy.timeOptionId).timeZone, null);
  assert.equal(all.proposedMeetings.find(item => item.id === option.timeOptionId).location, 'Snapshot room');
  assert.deepEqual(all.items.find(item => item.id === candidates[1].candidateId).availableMeetingOptionIds, [legacy.timeOptionId]);
  assert.deepEqual(all.items.find(item => item.id === candidates[3].candidateId).availableMeetingOptionIds, [legacy.timeOptionId]);
  const uninvited = all.items.find(item => item.status === 'ELIGIBLE'); assert.equal(uninvited.responseStatus, null); assert.equal(uninvited.activeAttempt, null);
  assert.equal(all.items.find(item => item.status === 'CANCELLED').outcome, 'CANCELLED');
  const paired = (await list(appointment.observationId)).items[0]; assert.equal(paired.outcome, 'SELECTED'); assert.equal(paired.responseStatus, 'ACCEPTED');
  assert.deepEqual((await list(target.observationId, 'responseStatus=DECLINED')).items.map(item => item.id), [candidates[1].candidateId]);
  assert.equal((await list(target.observationId, 'responseStatus=PENDING')).items[0].responseStatus, 'PENDING'); // Recorded, not rewritten by elapsed time.
  const seen = []; let cursor;
  do {
    const page = await list(target.observationId, new URLSearchParams({ limit: '2', ...(cursor ? { cursor } : {}) }).toString());
    seen.push(...page.items.map(item => item.id)); cursor = page.pageInfo.nextCursor;
  } while (cursor);
  assert.deepEqual(seen, candidates.map(item => item.candidateId).sort());
  await assert.rejects(list(target.observationId, 'cursor=' + foreignCandidate.candidateId), error => error.status === 400);
  await assert.rejects(list(target.observationId, `responseStatus=DECLINED&cursor=${candidates[0].candidateId}`), error => error.status === 400);
  await assert.rejects(list(randomUUID()), error => error.status === 404);
  await assert.rejects(list('bad'), error => error.status === 422);
  for (const userId of [users[0], users[1], users[4]]) {
    await assert.rejects(list(target.observationId, '', { id: userId, permissions: ['observations.read.own', 'recommendations.read.released.own'] }), error => error.status === 403);
  }
  assert.equal(await fingerprint(), before);
  await db.recommendationList.update({ where: { listId: targetList.listId }, data: { publishedAt: now } });
  await db.observation.update({ where: { observationId: target.observationId }, data: { recommendationsReleasedAt: now, currentReleasedListId: targetList.listId, currentDraftListId: null } });
  assert.equal((await list(target.observationId)).releasedAt, now.toISOString());
  await assert.rejects(list(target.observationId, '', { id: users[0], permissions: ['recommendations.read.released.own'] }), error => error.status === 403);
  await db.observationCandidate.update({ where: { candidateId: candidates[0].candidateId }, data: { acceptedOptionId: foreignOption.timeOptionId } });
  await assert.rejects(list(target.observationId), error => error.code === 'INCONSISTENT_CANDIDATE');
  console.log('Passed PostgreSQL READ ONLY candidate queries: AC-only access, observation/cursor isolation, latest recorded responses, five-entry historical course/semester ordering and deduplication, unchanged current-semester compatibility, persisted UUIDs/nulls, no mutation or notifications.');
} finally {
  await db.$disconnect(); await migration.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
