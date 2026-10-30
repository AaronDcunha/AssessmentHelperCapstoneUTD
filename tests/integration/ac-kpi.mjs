// Real Prisma queries in an isolated local schema; application records are untouched.
import '../../scripts/server-loader.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
const { PrismaClient } = await import('../../src/generated/prisma/client.ts');
const { getCycleReport } = await import('../../src/server/queries/ac-reports.ts');

const url = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
url.searchParams.delete('schema');
const schema = 'ac_kpi_test_' + randomUUID().replaceAll('-', '');
const admin = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
const migrations = new pg.Pool({ connectionString: url.toString(), options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema }) });
const users = Array.from({ length: 5 }, randomUUID), professors = Array.from({ length: 5 }, randomUUID);
const [departmentId, otherDepartment, hiringLevelId, semesterId, priorSemester, cycleId, priorCycle, emptySemester, emptyCycle, courseId, sectionId, templateId] = Array.from({ length: 12 }, randomUUID);
const actor = { id: users[0], permissions: ['metrics.read', 'reports.read'] };
const read = (view = 'metrics', query = '', user = actor, cycle = cycleId) => getCycleReport(db, user, new URL(`http://localhost/test?${query}`), cycle, view);
const value = (response, key) => response.metrics.find(m => m.key === key);
let created = false;
try {
  await admin.query(`CREATE SCHEMA ${schema}`); created = true;
  const root = new URL('../../prisma/migrations/', import.meta.url);
  for (const folder of (await readdir(root, { withFileTypes: true })).filter(x => x.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
    const sql = (await readFile(new URL(`${folder.name}/migration.sql`, root), 'utf8'))
      .replace('CREATE SCHEMA IF NOT EXISTS "public";', '').replace(/\bpublic\./g, `${schema}.`).replace(/"public"\./g, `"${schema}".`);
    await migrations.query(sql);
  }
  await db.appUser.createMany({ data: users.map((userId,i) => ({ userId, fullName: `Professor ${i}`, email: `kpi${i}@test.invalid` })) });
  await db.department.createMany({ data: [departmentId,otherDepartment].map((departmentId,i) => ({ departmentId, departmentName: `Department ${i}` })) });
  await db.hiringLevel.create({ data: { hiringLevelId, levelName:'Assistant', evaluationIntervalYears:1 } });
  await db.professor.createMany({ data: professors.map((professorId,i) => ({ professorId, userId:users[i], departmentId:i===3 ? otherDepartment : departmentId, hiringLevelId, hireDate:i===4 ? null : new Date('2020-01-01') })) });
  await db.semester.createMany({ data: [
    { semesterId, termCode:'26f', termName:'Fall 2026', startsOn:new Date('2026-08-31'), endsOn:new Date('2026-12-16') },
    { semesterId:priorSemester, termCode:'25s', termName:'Spring 2025' },
    { semesterId:emptySemester, termCode:'27s', termName:'Spring 2027' },
  ] });
  await db.evaluationCycle.createMany({ data:[cycleId,priorCycle,emptyCycle].map((cycleId,i) => ({ cycleId, semesterId:[semesterId,priorSemester,emptySemester][i], cycleName:`Cycle ${i}`, signupDeadline:new Date('2026-10-01'), observationDeadline:new Date('2026-12-01'), feedbackDeadline:new Date('2026-12-10') })) });
  await db.course.create({ data:{ courseId, departmentId, courseCode:'CS 4485', courseTitle:'Test', courseLevel:4000 } });
  await db.courseSection.create({ data:{ sectionId, courseId, semesterId, sectionCode:'001' } });
  await db.classMeeting.create({ data:{ sectionId, dayOfWeek:'Monday', startTime:'10:00', endTime:'11:00' } });
  const observerSection = await db.courseSection.create({ data:{ courseId, semesterId, sectionCode:'002' } });
  await db.classMeeting.create({ data:{ sectionId:observerSection.sectionId, dayOfWeek:'Tuesday', startTime:'10:00', endTime:'11:00' } });
  await db.teaches.create({ data:{ professorId:professors[1], sectionId:observerSection.sectionId } });
  await db.observationTemplate.create({ data:{ templateId, templateName:'Test' } });
  const priorSection = await db.courseSection.create({ data:{ courseId, semesterId:priorSemester, sectionCode:'001' } });
  const previousSignup = await db.evaluationSignup.create({ data:{ cycleId:priorCycle, professorId:professors[0], sectionId:priorSection.sectionId } });
  const previousObservation = await db.observation.create({ data:{ cycleId:priorCycle, signupId:previousSignup.signupId, observerId:professors[1], status:'COMPLETED', completedAt:new Date('2025-04-01') } });
  await db.signedAssessment.create({ data:{ observationId:previousObservation.observationId, templateId, responses:{}, isLocked:true, observerSignedAt:new Date('2025-04-01'), observeeSignedAt:new Date('2025-04-01'), completedAt:new Date('2025-04-01') } });
  const signups = [];
  for (const professorId of professors.slice(0,4)) signups.push(await db.evaluationSignup.create({ data:{ cycleId, professorId, sectionId } }));
  const observations = [];
  for (let i=0;i<3;i++) observations.push(await db.observation.create({ data:{ cycleId, signupId:signups[i].signupId, observerId:i===0 ? professors[1] : i===1 ? professors[0] : null,
    status:i===0 ? 'COMPLETED' : i===1 ? 'NOT_OCCURRED' : 'PENDING', recommendationGenerationId:randomUUID(),
    ...(i<2 ? { scheduledAt:new Date(`2026-10-26T${i===0 ? '15' : '16'}:00:00Z`), scheduledEndsAt:new Date(`2026-10-26T${i===0 ? '16' : '17'}:00:00Z`) } : {}),
    ...(i===0 ? { completedAt:new Date('2026-10-27') } : {}) } }));
  await db.signedAssessment.create({ data:{ observationId:observations[0].observationId, templateId, responses:{}, isLocked:true, observerSignedAt:new Date('2026-10-27'), observeeSignedAt:new Date('2026-10-27'), completedAt:new Date('2026-10-27') } });
  await db.observationCandidate.createMany({ data:[0,1].map(i => ({ observationId:observations[0].observationId, professorId:professors[i], invitedAt:new Date('2026-10-02') })) });
  await db.observationTimeOption.create({ data:{ observationId:observations[0].observationId, preferredDate:new Date('2026-10-26'), startsAt:new Date('2026-10-26T15:00:00Z'), endsAt:new Date('2026-10-26T16:00:00Z'), timeZone:'America/Chicago' } });
  await db.facultyIssue.createMany({ data:users.slice(0,2).map(reportedBy => ({ observationId:observations[1].observationId, reportedBy, kind:'NOT_OCCURRED', reason:'Missed', details:'' })) });
  await db.processFeedback.createMany({ data:[{ observationId:observations[0].observationId, professorId:professors[0], feedbackRole:'OBSERVEE' }, { observationId:observations[0].observationId, professorId:professors[1], feedbackRole:'OBSERVER' }, { observationId:observations[1].observationId, professorId:professors[1], feedbackRole:'OBSERVEE' }] });
  await db.observation.create({ data:{ cycleId, signupId:signups[2].signupId, observerId:professors[2], status:'CANCELLED', recommendationGenerationId:randomUUID() } });

  let result = await read();
  assert.equal(result.source, 'database');
  assert.equal(value(result,'evaluationEligibilityAccuracy').value,50);
  assert.equal(value(result,'missingObservationCount').value,1,'Two participant reports count once');
  assert.equal(value(result,'observerUtilizationRate').value,50,'Cancelled assignment excluded');
  assert.equal(value(result,'surveyCompletionRate').value,25,'Observer survey and unfinished observee survey excluded');
  assert.equal(value(result,'listSufficiencyRate').value,null,'Not-yet-generated lists remain explicit');
  const report = await read('reports');
  assert.equal(report.summary.unmatched,2,'Signup without an observation is unmatched');
  assert.equal(report.summary.incomplete,2);
  assert.equal(report.byHiringLevel[0].pendingStages['reported-not-occurred'],1);
  assert.equal(report.summary.needsReview,1);
  assert.equal(report.byHiringLevel[0].overdue, report.summary.overdue);
  assert.ok(report.outstandingObservations.every(o => !o.overdue), 'Pending work before deadline is not overdue');
  const cancelledRelease = await db.observation.create({ data: { cycleId, signupId: signups[3].signupId, status: 'CANCELLED', recommendationGenerationId: randomUUID(), recommendationsReleasedAt: new Date() } });
  assert.equal((await read('reports')).unmatchedFaculty.find(s => s.signupId === signups[3].signupId).stage, 'awaiting-generation');
  await db.observation.delete({ where: { observationId: cancelledRelease.observationId } });
  await db.observation.create({ data:{ cycleId, signupId:signups[3].signupId, recommendationGenerationId:randomUUID() } });
  result = await read();
  assert.equal(value(result,'listSufficiencyRate').value,0.5,'Generated zero-match lists stay in denominator');
  assert.equal(value(result,'listSufficiencyRate').unit,'matches');
  assert.equal(value(result,'assessmentParticipationRate').value,100);
  assert.equal(value(result,'assessmentParticipationRate').denominator,4,'Current-cycle completion does not erase prior Due status');
  // A not-due voluntary signup stays in the numerator; percentages may exceed 100.
  const voluntaryLevel = await db.hiringLevel.create({ data:{ levelName:'Associate', evaluationIntervalYears:2 } });
  await db.professor.update({ where:{ professorId:professors[0] }, data:{ hiringLevelId:voluntaryLevel.hiringLevelId } });
  const voluntary = await read();
  assert.equal(value(voluntary,'assessmentParticipationRate').value,133.33);
  const rankFiltered = await read('metrics', `hiringLevelId=${voluntaryLevel.hiringLevelId}`);
  assert.equal(rankFiltered.counts.signups,1);
  assert.equal(value(rankFiltered,'assessmentParticipationRate').value,null,'Zero due denominator is N/A');
  const scoped = await read('metrics', `departmentId=${otherDepartment}`);
  assert.equal(scoped.counts.signups,1);
  assert.equal(value(scoped,'observerUtilizationRate').value,0);
  const empty = await read('metrics','',actor,emptyCycle);
  assert.equal(value(empty,'observerUtilizationRate').value,null);
  assert.equal(value(empty,'surveyCompletionRate').value,null);
  assert.equal(value(empty,'missingObservationCount').value,0);
  await assert.rejects(read('metrics','',{ ...actor, permissions:['reports.read'] }), e => e.status===403);
  await assert.rejects(read('metrics','departmentId=invalid'), e => e.status===422);
  const oldSemester = await db.semester.create({ data: { termCode: '23f', termName: 'Fall 2023' } });
  const oldCycle = await db.evaluationCycle.create({ data: { semesterId: oldSemester.semesterId, cycleName: 'Old', signupDeadline: new Date('2023-09-01'), observationDeadline: new Date('2023-12-01'), feedbackDeadline: new Date('2023-12-10') } });
  const oldSection = await db.courseSection.create({ data: { courseId, semesterId: oldSemester.semesterId, sectionCode: '001' } });
  const oldSignup = await db.evaluationSignup.create({ data: { cycleId: oldCycle.cycleId, professorId: professors[2], sectionId: oldSection.sectionId } });
  await db.observation.create({ data: { cycleId: oldCycle.cycleId, signupId: oldSignup.signupId, status: 'COMPLETED', completedAt: new Date('2023-11-01'), signedAssessment: { create: { templateId, responses: {}, isLocked: true, observerSignedAt: new Date('2023-11-01'), observeeSignedAt: new Date('2023-11-01'), completedAt: new Date('2023-11-01') } } } });
  await db.evaluationCycle.update({ where: { cycleId }, data: { observationDeadline: new Date(Date.now() - 86400000) } });
  const lateReport = await read('reports');
  assert.equal(lateReport.byHiringLevel.find(h => h.hiringLevelId === hiringLevelId).overdue, 1);
  assert.equal(lateReport.byHiringLevel.reduce((sum, h) => sum + h.overdue, 0), lateReport.summary.overdue);
  assert.equal(lateReport.outstandingObservations.find(o => o.observationId === observations[2].observationId).overdue, true);
  assert.equal(lateReport.outstandingObservations.find(o => o.observationId === observations[1].observationId).overdue, false);
  assert.equal(lateReport.byHiringLevel.find(h => h.hiringLevelId === hiringLevelId).overdueStages['awaiting-observer'], 2);
  console.log('Passed database KPI formulas, scope, zero denominators, matching reuse, distinct reports, cancellation, survey roles and signup-only reports.');
} finally {
  await db.$disconnect(); await migrations.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
