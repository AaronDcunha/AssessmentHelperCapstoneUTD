// All writes are confined to a disposable schema; application data is untouched.
import '../configuration-loader.mjs';
import assert from 'node:assert/strict';
import { recommendationFixture } from '../recommendation-fixtures.mjs';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
const { PrismaClient } = await import('../../src/generated/prisma/client.ts');
const { getPersonalObservations } = await import('../../src/server/queries/personal-observations.ts');
const { parseObservationHistoryResponse } = await import('../../src/lib/observation-history-response.ts');
const url = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
url.searchParams.delete('schema');
const schema = 'own_observations_test_' + randomUUID().replaceAll('-', '');
const admin = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
const migration = new pg.Pool({ connectionString: url.toString(), options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema }) });
const ids = Array.from({ length: 20 }, () => randomUUID());
const [u1,u2,u3,p1,p2,p3,departmentId,hiringLevelId,s1,s2,c1,c2,courseId,section1,section2,templateId,o1,o2,o3,o4] = ids;
const user = { id: u1, permissions: ['observations.read.own'] };
const list = (params = '', actor = user) => getPersonalObservations(db, actor, new URLSearchParams(params));
let created = false;
try {
  await admin.query(`CREATE SCHEMA ${schema}`); created = true;
  const root = new URL('../../prisma/migrations/', import.meta.url);
  for (const folder of (await readdir(root, { withFileTypes: true })).filter(x => x.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
    let sql = await readFile(new URL(`${folder.name}/migration.sql`, root), 'utf8');
    sql = sql.replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
    await migration.query(sql);
  }
  await db.appUser.createMany({ data: [u1,u2,u3].map((userId,i) => ({ userId, username: `user${i}`, fullName: `Faculty ${i}`, email: `faculty${i}@test.invalid` })) });
  await db.department.create({ data: { departmentId, departmentName: 'Test' } });
  await db.hiringLevel.create({ data: { hiringLevelId, levelName: 'Assistant', evaluationIntervalYears: 1 } });
  await db.professor.createMany({ data: [p1,p2,p3].map((professorId,i) => ({ professorId, userId: [u1,u2,u3][i], departmentId, hiringLevelId })) });
  await db.semester.createMany({ data: [{ semesterId:s1, termCode:'26f', termName:'Fall 2026' }, { semesterId:s2, termCode:'27s', termName:'Spring 2027' }] });
  await db.evaluationCycle.createMany({ data: [c1,c2].map((cycleId,i) => ({ cycleId, semesterId:[s1,s2][i], cycleName: `Cycle ${i}`, signupDeadline:new Date('2026-10-31'), observationDeadline:new Date('2026-11-30'), feedbackDeadline:new Date('2026-12-07') })) });
  await db.course.create({ data: { courseId, departmentId, courseCode:'CS 4485', courseTitle:'Capstone', courseLevel:4000 } });
  await db.courseSection.createMany({ data:[{sectionId:section1, semesterId:s1, courseId, sectionCode:'001'}, {sectionId:section2, semesterId:s2, courseId, sectionCode:'002'}] });
  await db.classMeeting.create({ data: { sectionId:section1, dayOfWeek:'Monday', startTime:'10:00', endTime:'11:00', location:'Room 1' } });
  await db.observationTemplate.create({ data: { templateId, templateName:'Test', status:'published' } });
  const rows = [
    { observationId:o1, cycleId:c1, professorId:p1, observerId:p2, sectionId:section1, status:'COMPLETED', locked:true },
    { observationId:o2, cycleId:c1, professorId:p2, observerId:p1, sectionId:section1, status:'SCHEDULED', locked:false },
    { observationId:o3, cycleId:c2, professorId:p1, observerId:null, sectionId:section2, status:'PENDING' },
    { observationId:o4, cycleId:c1, professorId:p3, observerId:p2, sectionId:section1, status:'COMPLETED', locked:true },
  ];
  const scheduledAt = new Date('2026-10-26T15:00:00Z');
  for (const row of rows) {
    const { professorId, sectionId, locked, ...observation } = row;
    const signup = await db.evaluationSignup.create({ data: { professorId, sectionId, cycleId:row.cycleId } });
    await db.observation.create({ data: { ...observation, signupId:signup.signupId,
      ...(row.observationId===o2 ? { scheduledAt, scheduledEndsAt:new Date('2026-10-26T16:00:00Z'), workflowRevision:3 } : {}),
      ...(row.status==='COMPLETED' ? { completedAt:new Date('2026-10-27') } : {}) } });
    if (locked!==undefined) await db.signedAssessment.create({ data: { observationId:row.observationId, templateId, responses:{}, isLocked:locked } });
  }
  await db.observationTimeOption.create({ data: { observationId:o2, preferredDate:new Date('2026-10-26'), startsAt:scheduledAt, endsAt:new Date('2026-10-26T16:00:00Z'), timeZone:'America/Chicago', location:'Room 1' } });
  // Merely being a candidate, including an accepted one, never grants own-observation membership.
  const recommendations = await recommendationFixture(db, o4, { released:true });
  await db.observationCandidate.create({ data: { observationId:o4, recommendationListId:recommendations.listId, professorId:p1, status:'ACCEPTED' } });
  const all = await list();
  assert.deepEqual(new Set(all.items.map(x=>x.id)), new Set([o1,o2,o3]));
  assert.equal(parseObservationHistoryResponse(all).length, 3);
  assert.deepEqual(new Set((await list('', { ...user, permissions:['observations.read.own','observations.read','assessments.read'] })).items.map(x=>x.id)), new Set([o1,o2,o3]));
  assert.deepEqual((await list('participation=observer')).items.map(x=>x.id), [o2]);
  assert.deepEqual(new Set((await list('participation=observee')).items.map(x=>x.id)), new Set([o1,o3]));
  assert.deepEqual((await list(`cycleId=${c2}&semesterId=${s2}&participation=observee&status=PENDING&assessmentStatus=NOT_STARTED`)).items.map(x=>x.id), [o3]);
  assert.deepEqual((await list('assessmentStatus=COMPLETED')).items.map(x=>x.id), [o1]);
  assert.deepEqual((await list('assessmentStatus=IN_PROGRESS')).items.map(x=>x.id), [o2]);
  assert.equal((await list(`cycleId=${c1}&semesterId=${s2}`)).items.length, 0);
  const scheduled = all.items.find(x=>x.id===o2);
  assert.equal(scheduled.scheduledMeeting.startsAt, scheduledAt.toISOString());
  assert.equal(scheduled.revision, 3); assert.equal(scheduled.occurred, null);
  assert.equal(scheduled.section.meetings[0].timeZone, 'America/Chicago');
  assert.equal(scheduled.observee.id, u2); assert.notEqual(scheduled.observee.id, p2);
  assert.equal(all.items.find(x=>x.id===o1).occurred, true);
  const seen=[]; let cursor;
  do { const page=await list(new URLSearchParams({limit:'1', ...(cursor ? {cursor} : {})})); seen.push(...page.items.map(x=>x.id)); cursor=page.pageInfo.nextCursor; } while(cursor);
  assert.deepEqual(seen, [o1,o2,o3].sort());
  for (const query of [`cursor=${o4}`, `participation=observer&cursor=${o1}`, `status=PENDING&cursor=${o2}`]) await assert.rejects(list(query), e=>e.status===400);
  assert.deepEqual((await list('', {id:randomUUID(), permissions:['observations.read.own']})).items, []);
  assert.equal(await db.observation.count(), 4);
  console.log('Passed isolated PostgreSQL own-observation reads: ownership, AC/Admin isolation, candidate exclusion, all filters, cursor pagination, DTOs, schedules and History adapter.');
} finally {
  await db.$disconnect(); await migration.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
