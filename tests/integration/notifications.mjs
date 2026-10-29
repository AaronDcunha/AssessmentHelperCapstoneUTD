// Local disposable schema only; application data and outbound delivery are untouched.
import '../configuration-loader.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {PrismaPg} from '@prisma/adapter-pg';
const {PrismaClient}=await import('../../src/generated/prisma/client.ts');
const {getNotifications,getUnreadNotificationCount}=await import('../../src/server/queries/notifications.ts');
const {setNotificationRead,markAllNotificationsRead,createWorkflowNotification}=await import('../../src/server/services/notifications.ts');
const {parseNotificationPage,notificationDestination}=await import('../../src/lib/notifications-api.ts');
const url=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));url.searchParams.delete('schema');
const schema='notifications_test_'+randomUUID().replaceAll('-','');
const admin=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
const migration=new pg.Pool({connectionString:url.toString(),options:`-c search_path=${schema}`,connectionTimeoutMillis:5000});
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()},{schema})});
const [u1,u2,u3,p1,p2,departmentId,hiringLevelId,semesterId,cycleId,courseId,sectionId,o1,o2]=Array.from({length:13},()=>randomUUID());
const user={id:u1,permissions:['notifications.read.own','notifications.update.own','observations.read.own']};
const tx=fn=>db.$transaction(fn,{isolationLevel:'RepeatableRead'});
const list=(query='',actor=user,now=new Date())=>tx(t=>getNotifications(t,actor,new URLSearchParams(query),now));
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
 const baseline=new Date(), older=new Date(baseline.getTime()-10000), future=new Date(baseline.getTime()+60000);
 const [n1,n2,n3,n4,foreign]=Array.from({length:5},()=>randomUUID());
 const input=(notificationId,userId,extra={})=>({notificationId,userId,title:'Test notice',message:'Test message',notificationType:'WORKFLOW',createdAt:older,...extra});
 await db.notification.createMany({data:[input(n1,u1,{targetKind:'observation',targetId:o1}),input(n2,u1,{targetKind:'observation',targetId:o2}),input(n3,u1,{isRead:true,readAt:older}),input(n4,u1,{createdAt:future}),input(foreign,u2)]});
 const result=await list();assert.equal(result.items.length,3);assert.equal(result.unreadCount,3);assert.equal(parseNotificationPage(result).items.length,3);
 assert.equal(result.items.find(x=>x.id===n1).target.kind,'observation');assert.equal(result.items.find(x=>x.id===n2).target,null);
 const privileged=await list('',{...user,permissions:[...user.permissions,'observations.read','notifications.send']});
 assert.equal(privileged.items.length,3);assert.equal(privileged.items.find(x=>x.id===n2).target.kind,'acObservation');
 assert.equal(notificationDestination(privileged.items.find(x=>x.id===n2).target,['observations.read']),`/ac/observations/${o2}`);
 const seen=[];let cursor;
 do{const page=await list(new URLSearchParams({limit:'1',...(cursor?{cursor}:{})}));seen.push(...page.items.map(x=>x.id));cursor=page.pageInfo.nextCursor;}while(cursor);
 assert.deepEqual(seen,[n1,n2,n3].sort().reverse());
 const first=await list('limit=1');
 await assert.rejects(list(new URLSearchParams({cursor:first.pageInfo.nextCursor,read:'unread'})),e=>e.status===400);
 await assert.rejects(list(new URLSearchParams({cursor:first.pageInfo.nextCursor}),{...user,id:u2}),e=>e.status===400);
 await assert.rejects(list('cursor=malformed'),e=>e.status===400);
 assert.equal((await list('',{...user,id:u3})).items.length,0);
 assert.equal((await list('read=unread')).items.length,2);
 const read=await tx(t=>setNotificationRead(t,user,n1,{read:true}));assert.ok(read.readAt);
 const again=await tx(t=>setNotificationRead(t,user,n1,{read:true}));assert.equal(again.readAt,read.readAt);
 assert.equal((await tx(t=>setNotificationRead(t,user,n1,{read:false}))).readAt,null);
 await assert.rejects(tx(t=>setNotificationRead(t,user,foreign,{read:true})),e=>e.status===404);
 assert.equal((await db.notification.findUnique({where:{notificationId:foreign}})).isRead,false);
 await assert.rejects(tx(t=>setNotificationRead(t,{...user,permissions:['notifications.read.own']},n1,{read:true})),e=>e.status===403);
 const bulk=await tx(t=>markAllNotificationsRead(t,user,{},baseline));assert.equal(bulk.updatedCount,2);assert.equal(bulk.unreadCount,1);
 assert.equal((await db.notification.findUnique({where:{notificationId:n4}})).isRead,false);
 assert.equal((await tx(t=>markAllNotificationsRead(t,user,{},baseline))).updatedCount,0);
 assert.equal((await tx(t=>getUnreadNotificationCount(t,user,new URLSearchParams()))).unreadCount,1);
 const event={userId:u1,eventKey:'test:event',type:'WORKFLOW',title:'New notice',message:'A new event occurred',observationId:o1};
 const event1=await tx(t=>createWorkflowNotification(t,event)),event2=await tx(t=>createWorkflowNotification(t,event));assert.equal(event1.notificationId,event2.notificationId);
 assert.equal(await db.notification.count({where:{userId:u1,eventKey:event.eventKey}}),1);
 const concurrentEvents=await Promise.all([createWorkflowNotification(db,{...event,eventKey:'parallel:event'}),createWorkflowNotification(db,{...event,eventKey:'parallel:event'})]);
 assert.equal(concurrentEvents[0].notificationId,concurrentEvents[1].notificationId);
 await assert.rejects(db.notification.create({data:input(randomUUID(),u1,{targetId:o1})}));
 await assert.rejects(db.notification.create({data:input(randomUUID(),u1,{isRead:true,readAt:null})}));
 await assert.rejects(tx(async t=>{await createWorkflowNotification(t,{...event,eventKey:'rollback:event'});throw new Error('rollback');}));
 assert.equal(await db.notification.count({where:{eventKey:'rollback:event'}}),0);
 const watermark=(await list()).latestCursor;
 const arrival=await tx(t=>createWorkflowNotification(t,{...event,eventKey:'after:event'}));
 // Inclusive watermark boundaries replay equal-millisecond records rather than losing them.
 await db.notification.update({where:{notificationId:arrival.notificationId},data:{createdAt:new Date(JSON.parse(Buffer.from(watermark,'base64url')).at)}});
 const incremental=await list(new URLSearchParams({after:watermark}));assert.ok(incremental.items.some(x=>x.id===arrival.notificationId));
 // Establish a mark-all snapshot, then insert a new notification with the same createdAt.
 let release,started;const gate=new Promise(r=>{release=r;});const ready=new Promise(r=>{started=r;});const cutoff=new Date();
 const marking=db.$transaction(async t=>{await t.notification.count({where:{userId:u1}});started();await gate;return markAllNotificationsRead(t,user,{},cutoff);},{isolationLevel:'RepeatableRead',timeout:10000});
 await ready;const concurrent=await db.notification.create({data:input(randomUUID(),u1,{createdAt:cutoff})});release();await marking;
 assert.equal((await db.notification.findUnique({where:{notificationId:concurrent.notificationId}})).isRead,false);
 console.log('Passed isolated PostgreSQL notification tests: ownership, personal AC/Admin scope, authorized targets, tie-safe pagination, incremental boundary overlap, read/unread idempotence, cutoff/snapshot-safe mark-all, event deduplication and transaction rollback. No email was sent.');
}finally{await db.$disconnect();await migration.end();if(created)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
