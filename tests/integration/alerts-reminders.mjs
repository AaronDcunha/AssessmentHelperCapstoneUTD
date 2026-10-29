// Local disposable schema only; application data and outbound delivery are untouched.
import '../configuration-loader.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {PrismaPg} from '@prisma/adapter-pg';
const {PrismaClient}=await import('../../src/generated/prisma/client.ts');



const url=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));url.searchParams.delete('schema');
const schema='alerts_reminders_test_'+randomUUID().replaceAll('-','');
const admin=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
const migration=new pg.Pool({connectionString:url.toString(),options:`-c search_path=${schema}`,connectionTimeoutMillis:5000});
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()},{schema})});
const [u1,u2,u3,p1,p2,departmentId,hiringLevelId,semesterId,cycleId,courseId,sectionId,o1,o2]=Array.from({length:13},()=>randomUUID());

const tx=fn=>db.$transaction(fn,{isolationLevel:'RepeatableRead'});

let created=false;
try{
 await admin.query(`CREATE SCHEMA ${schema}`);created=true;
 const root=new URL('../../prisma/migrations/',import.meta.url);
 for(const directory of (await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
  const sql=(await readFile(new URL(`${directory.name}/migration.sql`,root),'utf8')).replace('CREATE SCHEMA IF NOT EXISTS "public";','');await migration.query(sql);
 }
 await db.appUser.createMany({data:[u1,u2,u3].map((userId,i)=>({userId,username:'user'+i,fullName:'Faculty '+i,email:`faculty${i}@test.invalid`}))});
 await db.department.create({data:{departmentId,departmentName:'Test'}});await db.hiringLevel.create({data:{hiringLevelId,levelName:'Assistant',evaluationIntervalYears:1}});
 await db.professor.createMany({data:[{professorId:p1,userId:u1,departmentId,hiringLevelId},{professorId:p2,userId:u2,departmentId,hiringLevelId}]});
 await db.semester.create({data:{semesterId,termCode:'26f',termName:'Fall 2026'}});
 await db.evaluationCycle.create({data:{cycleId,semesterId,cycleName:'Test',signupDeadline:new Date('2026-01-01'),observationDeadline:new Date('2026-11-30'),feedbackDeadline:new Date('2026-12-07')}});
 await db.course.create({data:{courseId,departmentId,courseCode:'TEST',courseTitle:'Test',courseLevel:4000}});
 await db.courseSection.create({data:{sectionId,courseId,semesterId,sectionCode:'001'}});
 for(const [professorId,observationId]of [[p1,o1],[p2,o2]]){
  const signup=await db.evaluationSignup.create({data:{cycleId,professorId,sectionId}});await db.observation.create({data:{observationId,signupId:signup.signupId,cycleId}});
 }

 const {createObservationAlert}=await import('../../src/server/services/alerts.ts');
 const {getAlert,getCycleAlerts}=await import('../../src/server/queries/alerts.ts');
 const {sendCycleReminders}=await import('../../src/server/services/cycle-reminders.ts');
 const faculty={id:u1,permissions:['observations.read.own','invitations.send.own']};
 const observer={id:u2,permissions:[...faculty.permissions]};
 const committee={id:u3,permissions:['observations.read','notifications.send','cycles.read','reports.read']};
 const observationPermission=await db.permission.create({data:{permissionName:'observations.read'}});
 const role=await db.role.create({data:{roleName:'AC',rolePermissions:{create:[{permissionId:observationPermission.permissionId}]}}});
 await db.userRole.create({data:{userId:u3,roleId:role.roleId}});
 const [ac2,inactiveAC,adminUser]=Array.from({length:3},()=>randomUUID());
 await db.appUser.createMany({data:[{userId:ac2,fullName:'Second AC',email:'ac2@test.invalid'},{userId:inactiveAC,fullName:'Inactive AC',email:'inactive@test.invalid',isActive:false},{userId:adminUser,fullName:'Admin',email:'admin@test.invalid'}]});
 const adminRole=await db.role.create({data:{roleName:'Admin'}});
 await db.userRole.createMany({data:[{userId:ac2,roleId:role.roleId},{userId:ac2,roleId:adminRole.roleId},{userId:inactiveAC,roleId:role.roleId},{userId:adminUser,roleId:adminRole.roleId}]});
 await db.observation.update({where:{observationId:o1},data:{observerId:p2}});
 await db.observationCandidate.create({data:{observationId:o1,professorId:p2}});
 const creationKey=randomUUID();const create=()=>tx(t=>createObservationAlert(t,faculty,o1,{reasonCode:'OTHER',reason:'Please help',details:'Full context',creationKey}));
 const first=await create();assert.equal(first.created,true);assert.equal(first.alert.status,undefined);assert.deepEqual(first.alert.allowedActions,[]);assert.equal(first.alert.context.candidates.length,0);
 const again=await create();assert.equal(again.created,false);assert.equal(again.alert.id,first.alert.id);
 assert.equal(await db.notification.count({where:{userId:u3}}),1);
 for(const recipient of [u3,ac2,adminUser]){
  const notices=await db.notification.findMany({where:{userId:recipient,eventKey:'faculty-issue:'+first.alert.id},include:{emailDelivery:true}});
  assert.equal(notices.length,1,'Each active AC/Admin gets exactly one message');assert.ok(notices[0].emailDelivery);assert.equal(notices[0].emailDelivery.status,'pending');assert.ok(notices[0].message.includes('From: Faculty 0'));
 }
 assert.equal(await db.notification.count({where:{userId:inactiveAC}}),0);assert.equal(await db.notification.count({where:{userId:u2}}),0);
 await db.facultyIssue.update({where:{issueId:first.alert.id},data:{status:'RESOLVED',resolutionNote:'Historical note'}});
 const historic=await tx(t=>getAlert(t,committee,first.alert.id));assert.equal(historic.details,'Full context');assert.equal(historic.status,undefined);assert.equal(historic.resolutionNote,undefined);assert.deepEqual(historic.allowedActions,[]);
 const {getNotifications}=await import('../../src/server/queries/notifications.ts');
 const inbox=await tx(t=>getNotifications(t,{...committee,permissions:[...committee.permissions,'notifications.read.own']},new URLSearchParams()));
 assert.equal(inbox.items[0].sender.id,u1);assert.equal(inbox.items[0].sender.name,'Faculty 0');
 const restrictedInbox=await tx(t=>getNotifications(t,{id:u3,permissions:['notifications.read.own']},new URLSearchParams()));assert.equal(restrictedInbox.items[0].sender,null);

 await assert.rejects(tx(t=>createObservationAlert(t,observer,o1,{reasonCode:'OTHER',details:'Foreign'})),e=>e.status===404);
 await assert.rejects(tx(t=>getAlert(t,observer,first.alert.id)),e=>e.status===404);
 assert.equal((await tx(t=>getAlert(t,faculty,first.alert.id))).details,'Full context');
 assert.equal((await tx(t=>getAlert(t,committee,first.alert.id))).context.candidates.length,1);
 const alerts=await tx(t=>getCycleAlerts(t,committee,cycleId,new URL('http://test')));assert.equal(alerts.items.length,1);
 await assert.rejects(tx(t=>getCycleAlerts(t,faculty,cycleId,new URL('http://test'))),e=>e.status===403);
 assert.equal((await create()).created,false);assert.equal(await db.facultyIssue.count({where:{observationId:o1,kind:'ALERT'}}),1);
 await assert.rejects(tx(t=>createObservationAlert(t,faculty,o1,{reasonCode:'OTHER',reason:'Changed',details:'Full context',creationKey})),e=>e.status===409);
 const next=await tx(t=>createObservationAlert(t,faculty,o1,{reasonCode:'OTHER',reason:'A separate issue',details:'Additional context',creationKey:randomUUID()}));assert.equal(next.created,true);assert.notEqual(next.alert.id,first.alert.id);assert.equal(next.alert.status,undefined);
 const third=await tx(t=>createObservationAlert(t,faculty,o1,{reasonCode:'OTHER',reason:'Third issue',details:'Can coexist with a pending alert'}));assert.equal(third.created,true);assert.equal(await db.facultyIssue.count({where:{observationId:o1,kind:'ALERT'}}),3);
 const concurrentKey=randomUUID();const concurrentCreate=()=>tx(t=>createObservationAlert(t,faculty,o1,{reasonCode:'OTHER',reason:'Concurrent issue',details:'Single request',creationKey:concurrentKey}));await Promise.allSettled([concurrentCreate(),concurrentCreate()]);const replayed=await concurrentCreate();assert.equal(replayed.created,false);assert.equal(await db.facultyIssue.count({where:{observationId:o1,kind:'ALERT',occurrenceKey:concurrentKey}}),1);assert.equal(await db.notification.count({where:{userId:u3,eventKey:'faculty-issue:'+replayed.alert.id}}),1);assert.equal(await db.notificationEmail.count({where:{notificationId:(await db.notification.findFirstOrThrow({where:{userId:u3,eventKey:'faculty-issue:'+replayed.alert.id}})).notificationId}}),1);
 const key=randomUUID(),payload={kind:'custom',recipientFilter:{professorIds:[p1]},channels:['inApp'],message:'Please review your tasks.'};
 const send=()=>tx(t=>sendCycleReminders(t,committee,cycleId,payload,key));const sent=await send();assert.equal(sent.recipientCount,1);assert.equal(sent.status,'completed');
 const replay=await send();assert.equal(replay.dispatchId,sent.dispatchId);assert.equal(await db.notification.count({where:{userId:u1,eventKey:'reminder:'+key}}),1);
 await assert.rejects(tx(t=>sendCycleReminders(t,committee,cycleId,{...payload,message:'Changed'},key)),e=>e.status===409);
 await assert.rejects(tx(t=>sendCycleReminders(t,faculty,cycleId,payload,randomUUID())),e=>e.status===403);
 const count=await db.notification.count();
 const mailKey=randomUUID();const emailResult=await tx(t=>sendCycleReminders(t,committee,cycleId,{...payload,channels:['inApp','email']},mailKey));assert.equal(emailResult.emailQueuedCount,1);assert.equal(await db.notification.count(),count+1);
 const mailNotice=await db.notification.findFirstOrThrow({where:{eventKey:'reminder:'+mailKey}});assert.equal(await db.notificationEmail.count({where:{notificationId:mailNotice.notificationId}}),1);
 await assert.rejects(tx(t=>sendCycleReminders(t,committee,cycleId,payload,mailKey)),e=>e.status===409);
 const filtered=await tx(t=>sendCycleReminders(t,committee,cycleId,{...payload,recipientFilter:{professorIds:[p1],observationStatus:'PENDING'}},randomUUID()));assert.equal(filtered.recipientCount,1);
 await db.appUser.update({where:{userId:u2},data:{isActive:false}});
 const active=await tx(t=>sendCycleReminders(t,committee,cycleId,{...payload,recipientFilter:{}},randomUUID()));assert.equal(active.recipientCount,1);
 const rollbackKey=randomUUID();await assert.rejects(tx(async t=>{await sendCycleReminders(t,committee,cycleId,payload,rollbackKey);throw new Error('Rollback');}));assert.equal(await db.reminderDispatch.count({where:{dispatchId:rollbackKey}}),0);

 const retryKey=randomUUID();await Promise.allSettled([tx(t=>sendCycleReminders(t,committee,cycleId,payload,retryKey)),tx(t=>sendCycleReminders(t,committee,cycleId,payload,retryKey))]);
 assert.equal(await db.reminderDispatch.count({where:{dispatchId:retryKey}}),1);assert.equal(await db.notification.count({where:{userId:u1,eventKey:'reminder:'+retryKey}}),1);
 const due=await tx(t=>sendCycleReminders(t,committee,cycleId,{...payload,recipientFilter:{evaluationStatus:'due'}},randomUUID()));assert.equal(due.recipientCount,0);
 console.log('Passed isolated alert/reminder PostgreSQL tests: observee ownership, selected-observer denial, unreleased-candidate privacy, AC scope, multiple messages, retry deduplication, all-AC delivery, read-only message context, workflow notifications, reminder recipient filters/idempotence/rollback, inactive-recipient exclusion, and transactional email enqueue with no SMTP delivery.');
}finally{await db.$disconnect();await migration.end();if(created)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
