// Only a randomly named local schema is mutated. No SMTP worker is started.
import '../../scripts/server-loader.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { recommendationFixture } from '../recommendation-fixtures.mjs';
const { PrismaClient } = await import('../../src/generated/prisma/client.ts');

const target = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Disposable tests require local PostgreSQL');
target.searchParams.delete('schema');
const schema = 'late_acceptance_test_' + randomUUID().replaceAll('-', '');
assert.match(schema, /^late_acceptance_test_[a-f0-9]{32}$/);
const admin = new pg.Pool({ connectionString: target.toString(), connectionTimeoutMillis: 5000 });
const migrations = new pg.Pool({ connectionString: target.toString(), options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: target.toString() }, { schema }) });
globalThis.configurationPrisma = db;
let created = false;
try {
  await admin.query(`CREATE SCHEMA ${schema}`); created = true;
  const root = new URL('../../prisma/migrations/', import.meta.url);
  for (const dir of (await readdir(root, { withFileTypes: true })).filter(d => d.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
    const sql = (await readFile(new URL(`${dir.name}/migration.sql`, root), 'utf8')).replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
    assert.ok(!/\bpublic\s*\./i.test(sql), 'Migrations must stay in the disposable search path');
    await migrations.query(sql);
  }
  const actions = await import('../../src/server/services/faculty-invitations.ts');
  const { getLateAcceptanceRequests } = await import('../../src/server/queries/late-acceptance.ts');
  const now = new Date(), day = 86400000;
  const due = new Date(now.getTime() + 30*day);
  const [u1,u2,u3,p1,p2,departmentId,hiringLevelId,semesterId,cycleId,courseId,sectionId,otherSection] = Array.from({length:12}, randomUUID);
  await db.appUser.createMany({ data: [u1,u2,u3].map((userId,i) => ({ userId, fullName: ['Observee Fixture', 'Observer Fixture', 'Reviewer Fixture'][i], email: `late${i}@test.invalid` })) });
  await db.department.create({data:{departmentId,departmentName:'Isolated test'}});
  await db.hiringLevel.create({data:{hiringLevelId,levelName:'Test',evaluationIntervalYears:1}});
  await db.professor.createMany({data:[{professorId:p1,userId:u1,departmentId,hiringLevelId},{professorId:p2,userId:u2,departmentId,hiringLevelId}]});
  await db.semester.create({data:{semesterId,termCode:'test',termName:'Current test semester',startsOn:new Date('2000-01-01'),endsOn:new Date('2099-12-31'),timeZone:'America/Chicago'}});
  await db.evaluationCycle.create({data:{cycleId,semesterId,cycleName:'Isolated',signupDeadline:new Date(now.getTime()-day),observationDeadline:due,feedbackDeadline:new Date(due.getTime()+day)}});
  await db.course.create({data:{courseId,departmentId,courseCode:'TEST',courseTitle:'Isolated',courseLevel:4000}});
  await db.courseSection.createMany({data:[sectionId,otherSection].map((id,i)=>({sectionId:id,courseId,semesterId,sectionCode:String(i)}))});
  await db.teaches.create({data:{professorId:p2,sectionId:otherSection}});
  const proposed = new Date(now.getTime()+7*day).toISOString().slice(0,10);
  const weekday = new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(proposed+'T12:00:00Z'));
  await db.classMeeting.create({data:{sectionId,dayOfWeek:weekday,startTime:'10:00',endTime:'11:00',location:'Test room'}});
  const signup = await db.evaluationSignup.create({data:{cycleId,professorId:p1,sectionId}});
  const reviewer = {id:u3,permissions:['late-acceptance.review']};
  const observer = {id:u2,permissions:['profile.read.own','observations.read.own','invitations.respond.own']};
  const observee = {id:u1,permissions:['profile.read.own','observations.read.own','observer.select.own']};
  async function fixture() {
    const observation = await db.observation.create({data:{signupId:signup.signupId,cycleId}});
    const list = await recommendationFixture(db,observation.observationId,{released:true});
    const candidate = await db.observationCandidate.create({data:{observationId:observation.observationId,recommendationListId:list.listId,professorId:p2,status:'EXPIRED',invitedAt:new Date(now.getTime()-3*day),expiresAt:new Date(now.getTime()-day)}});
    const attempt = await db.invitationAttempt.create({data:{candidateId:candidate.candidateId,number:1,status:'EXPIRED',invitedAt:new Date(now.getTime()-3*day),expiresAt:new Date(now.getTime()-day)}});
    const request = await db.lateAcceptanceApproval.create({data:{attemptId:attempt.attemptId,reason:'Saved <reason> & context'}});
    const meeting = await db.observationTimeOption.create({data:{observationId:observation.observationId,preferredDate:new Date(proposed)}});
    return {observation,candidate,attempt,request,meeting};
  }
  const read = query => db.$transaction(tx=>getLateAcceptanceRequests(tx,reviewer,'current',new URL('http://localhost/?'+query)),{isolationLevel:'RepeatableRead'});
  const review = (f,decision) => actions.reviewLateAcceptance(reviewer,f.request.approvalId,{decision});
  const f = await fixture();
  await assert.rejects(actions.reviewLateAcceptance({...reviewer,permissions:[]},f.request.approvalId,{decision:'approved'}),e=>e.status===403);
  for (const invalid of ['invalid', ['approved'], null, {}, true]) await assert.rejects(review(f,invalid),e=>e.status===400);
  const result = await review(f,'approved'); assert.equal(result.request.status,'APPROVED');
  assert.equal((await db.observation.findUnique({where:{observationId:f.observation.observationId}})).observerId,null);
  const reopened = await db.invitationAttempt.findFirst({where:{candidateId:f.candidate.candidateId},orderBy:{number:'desc'}});
  assert.equal(reopened.number,2); assert.equal(reopened.status,'PENDING');
  assert.ok(reopened.expiresAt <= due && reopened.expiresAt.getTime()-reopened.invitedAt.getTime() <= 48*3600000);
  assert.equal((await read('requestId='+f.request.approvalId)).items[0].originalInvitationExpiresAt,f.attempt.expiresAt.toISOString());
  await assert.rejects(review(f,'rejected'),e=>e.status===409);
  await assert.rejects(actions.acceptFacultyInvitation(observer,{candidateId:f.candidate.candidateId,attemptId:f.attempt.attemptId,meetingOptionId:f.meeting.timeOptionId}),e=>e.status===409);
  await actions.acceptFacultyInvitation(observer,{candidateId:f.candidate.candidateId,attemptId:reopened.attemptId,meetingOptionId:f.meeting.timeOptionId});
  assert.equal((await db.observation.findUnique({where:{observationId:f.observation.observationId}})).observerId,null,'acceptance must not pair');
  await actions.selectFacultyObserver(observee,{candidateId:f.candidate.candidateId});
  assert.equal((await db.observation.findUnique({where:{observationId:f.observation.observationId}})).observerId,p2);

  const rejected = await fixture(); await review(rejected,'rejected');
  assert.equal(await db.invitationAttempt.count({where:{candidateId:rejected.candidate.candidateId}}),1);
  assert.equal((await db.lateAcceptanceApproval.findUnique({where:{approvalId:rejected.request.approvalId}})).status,'REJECTED');
  const historical = await fixture();
  const pastSemester = await db.semester.create({data:{termCode:'past',termName:'Past fixture',startsOn:new Date('2000-01-01'),endsOn:new Date('2001-01-01')}});
  const pastCycle = await db.evaluationCycle.create({data:{semesterId:pastSemester.semesterId,cycleName:'Past',signupDeadline:new Date('2000-01-01'),observationDeadline:new Date('2000-02-01'),feedbackDeadline:new Date('2000-03-01')}});
  const pastSection = await db.courseSection.create({data:{courseId,semesterId:pastSemester.semesterId,sectionCode:'past'}});
  const pastSignup = await db.evaluationSignup.create({data:{cycleId:pastCycle.cycleId,professorId:p1,sectionId:pastSection.sectionId}});
  await db.observation.update({where:{observationId:historical.observation.observationId},data:{cycleId:pastCycle.cycleId,signupId:pastSignup.signupId}});
  await assert.rejects(read('requestId='+historical.request.approvalId),e=>e.status===404);
  await assert.rejects(review(historical,'approved'),e=>e.status===409);
  for (const kind of ['superseded','confirmed','deadline','cancelled','answered','outOfCycle']) {
    const item = await fixture();
    if(kind==='superseded') await db.invitationAttempt.create({data:{candidateId:item.candidate.candidateId,number:2,invitedAt:now,expiresAt:due}});
    if(kind==='confirmed') await db.observation.update({where:{observationId:item.observation.observationId},data:{observerId:p2}});
    if(kind==='cancelled') await db.invitationAttempt.update({where:{attemptId:item.attempt.attemptId},data:{cancelledAt:now}});
    if(kind==='answered') await db.observationCandidate.update({where:{candidateId:item.candidate.candidateId},data:{respondedAt:now,status:'DECLINED'}});
    if(kind==='deadline') await db.evaluationCycle.update({where:{cycleId},data:{observationDeadline:new Date(now.getTime()-1000)}});
    if(kind==='outOfCycle') await db.semester.update({where:{semesterId},data:{endsOn:new Date('2001-01-01')}});
    await assert.rejects(review(item,'approved'),e=>e.status===409,kind);
    assert.equal((await db.lateAcceptanceApproval.findUnique({where:{approvalId:item.request.approvalId}})).status,'PENDING');
    if(kind==='deadline') await db.evaluationCycle.update({where:{cycleId},data:{observationDeadline:due}});
    if(kind==='outOfCycle') { assert.equal((await read('requestId='+item.request.approvalId)).cycle,null); await db.semester.update({where:{semesterId},data:{endsOn:new Date('2099-12-31')}}); }
  }
  const race = await fixture();
  const decisions = await Promise.allSettled([review(race,'approved'),review(race,'rejected')]);
  assert.equal(decisions.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(decisions.find(r=>r.status==='rejected').reason.status,409);
  const winner = await db.lateAcceptanceApproval.findUnique({where:{approvalId:race.request.approvalId}});
  assert.equal(await db.invitationAttempt.count({where:{candidateId:race.candidate.candidateId}}),winner.status==='APPROVED'?2:1);
  const cap = await fixture();
  const near = new Date(Date.now()+3600000);
  await db.evaluationCycle.update({where:{cycleId},data:{observationDeadline:near}});
  await review(cap,'approved');
  assert.equal((await db.invitationAttempt.findFirst({where:{candidateId:cap.candidate.candidateId},orderBy:{number:'desc'}})).expiresAt.getTime(),near.getTime());
  console.log('PASS: isolated PostgreSQL approval, rejection, conditional/concurrent decisions, original expiry, supersession/cancellation, confirmed observer, deadline, current-cycle guards, capped window, normal meeting acceptance and observee confirmation. Existing notifications queued only inside disposable schema; no email sent.');
} finally {
  await db.$disconnect(); await migrations.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end(); delete globalThis.configurationPrisma;
}
