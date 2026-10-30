// Fixture writes use a disposable schema, never application tables or migrations.
import '../configuration-loader.mjs';
import assert from 'node:assert/strict';
import { recommendationFixture } from '../recommendation-fixtures.mjs';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
const { PrismaClient } = await import('../../src/generated/prisma/client.ts');
const { getCycleSignups } = await import('../../src/server/queries/cycle-signups.ts');
const connectionUrl = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(connectionUrl.hostname), 'Use a local test database.');
connectionUrl.searchParams.delete('schema');
const schema = 'cycle_signups_test_' + randomUUID().replaceAll('-', '');
const admin = new pg.Pool({ connectionString: connectionUrl.toString(), connectionTimeoutMillis: 5000 });
const migration = new pg.Pool({ connectionString: connectionUrl.toString(), options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionUrl.toString() }, { schema }) });
const users = [randomUUID(), randomUUID(), randomUUID()];
const professors = [randomUUID(), randomUUID(), randomUUID()];
const departments = [randomUUID(), randomUUID()], levels = [randomUUID(), randomUUID()];
const semesters = [randomUUID(), randomUUID(), randomUUID()], cycles = [randomUUID(), randomUUID(), randomUUID()];
const courses = [randomUUID(), randomUUID()], sections = [randomUUID(), randomUUID(), randomUUID()];
const actor = { id: randomUUID(), permissions: ['signups.read'] }; // No teaching/signup membership.
const list = (query = '', cycleId = cycles[0], user = actor) => getCycleSignups(db, user, cycleId, new URL('http://local/signups?' + query));
let created = false;
try {
  await admin.query(`CREATE SCHEMA ${schema}`); created = true;
  const root = new URL('../../prisma/migrations/', import.meta.url);
  for (const folder of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const sql = (await readFile(new URL(`${folder.name}/migration.sql`, root), 'utf8')).replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
    await migration.query(sql);
  }
  await db.appUser.createMany({ data: users.map((userId, i) => ({ userId, fullName: ['Ada Example', 'Bruno Example', 'Clara Example'][i], email: `person${i}@test.invalid` })) });
  for (let i = 0; i < 2; i++) {
    await db.department.create({ data: { departmentId: departments[i], departmentName: ['CS', 'Math'][i] } });
    await db.hiringLevel.create({ data: { hiringLevelId: levels[i], levelName: `Level ${i}`, evaluationIntervalYears: i + 1 } });
    await db.course.create({ data: { courseId: courses[i], departmentId: departments[i], courseCode: ['CS 4348', 'MATH 2413'][i], courseTitle: ['Operating Systems', 'Calculus'][i], courseLevel: [4000, 2000][i] } });
  }
  for (let i = 0; i < 3; i++) {
    await db.professor.create({ data: { professorId: professors[i], userId: users[i], departmentId: departments[i === 1 ? 1 : 0], hiringLevelId: levels[i === 1 ? 1 : 0] } });
    await db.semester.create({ data: { semesterId: semesters[i], termCode: ['26f', '27s', '27f'][i], termName: `Semester ${i}`, timeZone: 'America/Chicago' } });
    await db.evaluationCycle.create({ data: { cycleId: cycles[i], semesterId: semesters[i], cycleName: `Cycle ${i}`, signupDeadline: new Date('2026-10-31'), observationDeadline: new Date('2026-11-30'), feedbackDeadline: new Date('2026-12-07') } });
    await db.courseSection.create({ data: { sectionId: sections[i], semesterId: semesters[i === 2 ? 1 : 0], courseId: courses[i === 1 ? 1 : 0], sectionCode: `00${i + 1}` } });
  }
  await db.classMeeting.create({ data: { sectionId: sections[0], dayOfWeek: 'Monday', startTime: '10:00', endTime: '11:15', location: 'Current room' } });
  const signups = [];
  for (const [cycleId, professorId, sectionId] of [
    [cycles[0], professors[0], sections[0]], [cycles[0], professors[1], sections[1]],
    [cycles[0], professors[2], sections[0]], [cycles[1], professors[0], sections[2]],
  ]) signups.push(await db.evaluationSignup.create({ data: { cycleId, professorId, sectionId } }));
  const generationId = randomUUID(), releasedAt = new Date('2026-10-25T18:00:00Z');
  const observation = await db.observation.create({ data: { signupId: signups[0].signupId, cycleId: cycles[0], workflowRevision: 7, recommendationGenerationId: generationId, recommendationsReleasedAt: releasedAt } });
  const draft = await db.observation.create({ data: { signupId: signups[1].signupId, cycleId: cycles[0] } });
  const foreign = await db.observation.create({ data: { signupId: signups[3].signupId, cycleId: cycles[1], recommendationGenerationId: randomUUID() } });
  const releasedList = await recommendationFixture(db, observation.observationId, { released:true, generationId, publishedAt:releasedAt });
  const draftList = await recommendationFixture(db, draft.observationId);
  const option = await db.observationTimeOption.create({ data: { observationId: observation.observationId, preferredDate: new Date('2026-11-09'), startsAt: new Date('2026-11-09T16:00:00Z'), endsAt: new Date('2026-11-09T17:15:00Z'), timeZone: 'America/Chicago', location: 'Snapshot room' } });
  await db.observationTimeOption.create({ data: { observationId: draft.observationId, preferredDate: new Date('2026-11-11') } });
  const foreignOption = await db.observationTimeOption.create({ data: { observationId: foreign.observationId, preferredDate: new Date('2027-03-01') } });

  const all = await list();
  assert.equal(all.items.length, 3);
  assert.deepEqual(new Set(all.items.map(item => item.signupId)), new Set(signups.slice(0, 3).map(item => item.signupId)));
  assert.ok(!JSON.stringify(all).includes(foreignOption.timeOptionId));
  const saved = all.items.find(item => item.signupId === signups[0].signupId);
  assert.equal(saved.observee.id, users[0]); assert.notEqual(saved.observee.id, professors[0]);
  assert.equal(saved.proposedMeetings[0].id, option.timeOptionId);
  assert.equal(saved.proposedMeetings[0].location, 'Snapshot room');
  assert.equal(saved.recommendationGenerationId, generationId);
  assert.equal(saved.currentReleasedListId,releasedList.listId); assert.equal(saved.currentDraftListId,null);
  assert.equal(saved.recommendationsReleasedAt, releasedAt.toISOString()); assert.equal(saved.observationRevision, 7);
  const legacy = all.items.find(item => item.observationId === draft.observationId);
  assert.equal(legacy.currentDraftListId,draftList.listId); assert.equal(legacy.currentReleasedListId,null);
  assert.equal(legacy.proposedMeetings[0].startsAt, null); assert.equal(legacy.proposedMeetings[0].timeZone, null);
  const withoutObservation = all.items.find(item => item.signupId === signups[2].signupId);
  assert.equal(withoutObservation.observationId, null); assert.deepEqual(withoutObservation.proposedMeetings, []);
  assert.equal((await list(`departmentId=${departments[1]}&hiringLevelId=${levels[1]}`)).items[0].signupId, signups[1].signupId);
  assert.deepEqual((await list(`departmentId=${departments[0]}&hiringLevelId=${levels[1]}`)).items, []);
  for (const q of ['ada', 'PERSON0@TEST.INVALID', 'Operating Systems', 'CS 4348', '001']) {
    const result = await list(new URLSearchParams({ q }).toString());
    assert.ok(result.items.some(item => item.signupId === signups[0].signupId));
    assert.ok(result.items.every(item => item.signupId !== signups[1].signupId));
  }
  assert.deepEqual((await list('', cycles[2])).items, []);
  await assert.rejects(list('', randomUUID()), error => error.status === 404);
  await assert.rejects(list('', cycles[0], { id: users[0], permissions: ['signups.read.own', 'observations.read.own'] }), error => error.status === 403);
  await assert.rejects(list(`cursor=${signups[3].signupId}`), error => error.status === 400);
  await assert.rejects(list(`departmentId=${departments[0]}&cursor=${signups[1].signupId}`), error => error.status === 400);
  const seen = []; let cursor;
  do {
    const page = await list(new URLSearchParams({ limit: '1', ...(cursor ? { cursor } : {}) }).toString());
    seen.push(...page.items.map(item => item.signupId)); cursor = page.pageInfo.nextCursor;
  } while (cursor);
  assert.deepEqual(seen, signups.slice(0, 3).map(item => item.signupId).sort());
  await db.observation.create({ data: { signupId: signups[0].signupId, cycleId: cycles[0] } });
  await assert.rejects(list(), error => error.code === 'AMBIGUOUS_OBSERVATION');
  console.log('Passed isolated PostgreSQL cycle signup reads: grants, cycle/filter/cursor isolation, pagination, persisted UUIDs/snapshots, null metadata, raw release markers and ambiguity rejection.');
} finally {
  await db.$disconnect(); await migration.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
