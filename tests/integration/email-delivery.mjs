import '../configuration-loader.mjs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return s==='server-only'?{url:'data:text/javascript,export{}',shortCircuit:true}:n(s,c);}});
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {PrismaPg} from '@prisma/adapter-pg';
const {PrismaClient}=await import('../../src/generated/prisma/client.ts');
const {createWorkflowNotification,setNotificationRead}=await import('../../src/server/services/notifications.ts');
const {getNotifications,getUnreadNotificationCount}=await import('../../src/server/queries/notifications.ts');
const {deliverNotificationEmails}=await import('../../src/server/jobs/email-delivery.ts');
const {createEmailTransport,emailMessage,defaultMailFrom}=await import('../../src/server/email/transport.ts');
const url=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));url.searchParams.delete('schema');
const schema='email_test_'+randomUUID().replaceAll('-','');
const admin=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
const sql=new pg.Pool({connectionString:url.toString(),options:`-c search_path=${schema}`,connectionTimeoutMillis:5000});
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()},{schema})});
const userId=randomUUID(),user={id:userId,permissions:['notifications.read.own','notifications.update.own']};
const historical=randomUUID(),sent=[];
let created=false,clock=new Date(Date.now()+1000);
const now=()=>clock;
const enqueue=(eventKey,extra={})=>db.$transaction(t=>createWorkflowNotification(t,{userId,eventKey,type:'TEST',title:'Email test',message:'Full test message',...extra}));
const deliver=send=>deliverNotificationEmails(db,send??(async m=>{sent.push(m);}),{now});
try{
 await admin.query(`CREATE SCHEMA ${schema}`);created=true;
 const root=new URL('../../prisma/migrations/',import.meta.url);
 for(const directory of (await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
  if(directory.name==='20261028020000_notification_email'){
   await sql.query('INSERT INTO app_user(user_id,full_name,email) VALUES ($1,$2,$3)',[userId,'Mailpit test','mailpit-test@example.invalid']);
   await sql.query("INSERT INTO notification(notification_id,user_id,title,message,notification_type) VALUES ($1,$2,'Historical','Do not send','TEST')",[historical,userId]);
  }
  await sql.query((await readFile(new URL(`${directory.name}/migration.sql`,root),'utf8')).replace('CREATE SCHEMA IF NOT EXISTS "public";',''));
 }
 assert.equal(await db.notificationEmail.count(),0,'No historical backfill');
 const notice=await enqueue('deduplicated');await enqueue('deduplicated');
 assert.equal(await db.notificationEmail.count(),1);
 await db.$transaction(t=>setNotificationRead(t,user,notice.notificationId,{read:true}));
 await db.$transaction(t=>setNotificationRead(t,user,notice.notificationId,{read:false}));
 assert.equal(await db.notificationEmail.count(),1,'Read changes cannot enqueue');
 await assert.rejects(db.$transaction(async t=>{await createWorkflowNotification(t,{userId,eventKey:'rollback',type:'TEST',title:'Rollback',message:'No send'});throw Error('Rollback');}));
 assert.equal(await db.notificationEmail.count(),1,'Queue rolls back with workflow');
 const legacy=randomUUID();await sql.query("INSERT INTO notification(notification_id,user_id,title,message,notification_type) VALUES ($1,$2,'Legacy','Same transaction','TEST')",[legacy,userId]);
 assert.equal(await db.notificationEmail.count(),2,'Legacy pg inserts use same queue');
 const legacyClient=await sql.connect();try{await legacyClient.query('BEGIN');await legacyClient.query("INSERT INTO notification(notification_id,user_id,title,message,notification_type) VALUES ($1,$2,'Legacy rollback','','TEST')",[randomUUID(),userId]);await legacyClient.query('ROLLBACK');}finally{legacyClient.release();}
 assert.equal(await db.notificationEmail.count(),2);
 await Promise.all([deliver(),deliver()]);assert.equal(sent.length,2,'Concurrent workers claim each message once');
 await deliver();assert.equal(sent.length,2,'Sent messages stay sent');
 await enqueue('inapp-only',{channels:['inApp']});assert.equal(await db.notificationEmail.count(),2);
 const hidden=await enqueue('email-only',{channels:['email']});
 const inbox=await db.$transaction(t=>getNotifications(t,user,new URLSearchParams(),clock));assert.ok(!inbox.items.some(x=>x.id===hidden.notificationId));
 const unread=await db.$transaction(t=>getUnreadNotificationCount(t,user,new URLSearchParams()));assert.equal(unread.unreadCount,4);
 await assert.rejects(db.$transaction(t=>setNotificationRead(t,user,hidden.notificationId,{read:true})),e=>e.status===404);
 await deliver();
 const retry=await enqueue('retry');const before=await db.notification.count();
 await deliver(async()=>{throw Object.assign(Error('Secret SMTP response'),{code:'ECONNECTION'});});
 let row=await db.notificationEmail.findUniqueOrThrow({where:{notificationId:retry.notificationId}});assert.equal(row.status,'pending');assert.equal(row.attempts,1);assert.equal(row.lastError,'ECONNECTION');
 assert.equal((await deliver()).sent,0,'Backoff is respected');assert.equal(await db.notification.count(),before,'SMTP failure preserves inbox');
 clock=new Date(clock.getTime()+60001);await deliver();row=await db.notificationEmail.findUniqueOrThrow({where:{notificationId:retry.notificationId}});assert.equal(row.status,'sent');assert.equal(row.attempts,2);
 const permanent=await enqueue('permanent');await deliver(async()=>{throw Object.assign(Error('Private recipient'),{responseCode:550,code:'EENVELOPE'});});assert.equal((await db.notificationEmail.findUniqueOrThrow({where:{notificationId:permanent.notificationId}})).status,'failed');
 const expired=await enqueue('lease-recovery');await db.notificationEmail.update({where:{notificationId:expired.notificationId},data:{status:'sending',leaseToken:randomUUID(),leaseUntil:new Date(clock.getTime()-1),attempts:1}});assert.equal((await deliver()).sent,1);
 const inactive=await enqueue('inactive');await db.appUser.update({where:{userId},data:{isActive:false}});assert.equal((await deliver()).skipped,1);assert.equal((await db.notificationEmail.findUniqueOrThrow({where:{notificationId:inactive.notificationId}})).status,'skipped');await db.appUser.update({where:{userId},data:{isActive:true}});
 const exhausted=await enqueue('exhausted');for(let i=0;i<5;i++){await deliver(async()=>{throw Error('Temporary outage');});clock=new Date(clock.getTime()+7200001);}assert.equal((await db.notificationEmail.findUniqueOrThrow({where:{notificationId:exhausted.notificationId}})).status,'failed');
 const escaped=emailMessage({id:randomUUID(),to:'test@example.invalid',title:'<script>\r\nInjected',message:'<img src="https://invalid"> & text'});assert.ok(!escaped.html.includes('<script>'));assert.ok(!escaped.html.includes('<img'));assert.ok(!escaped.subject.includes('\n'));assert.ok(defaultMailFrom.includes('noreply_course_evaluation@assessmenthelper.edu'));
 if(process.argv.includes('--mailpit')){
  const token=randomUUID(),title=`Assessment Helper Mailpit test ${token}`;
  await enqueue('mailpit-'+token,{title,message:'Mailpit captured this workflow email. In-app notification and email were queued in the same database transaction.'});
  const transport=createEmailTransport({SMTP_HOST:'127.0.0.1',SMTP_PORT:'1025',SMTP_SECURE:'false'});
  try{assert.equal((await deliver(async m=>{const info=await transport.sendMail(m);assert.equal(info.rejected.length,0);})).sent,1);}finally{transport.close();}
  const search=await fetch('http://127.0.0.1:8025/api/v1/search?query='+encodeURIComponent(token));assert.equal(search.status,200);const found=(await search.json()).messages.find(m=>m.Subject===title);assert.ok(found,'Mailpit must capture the actual SMTP message');assert.equal(found.From.Address,'noreply_course_evaluation@assessmenthelper.edu');
  const detail=await (await fetch('http://127.0.0.1:8025/api/v1/message/'+found.ID)).json();assert.ok(detail.Text.includes('Mailpit captured this workflow email.'));
  console.log('Mailpit SMTP capture verified: sender, recipient, subject and full message. Test email remains in Mailpit; disposable database records are removed.');
 }
 console.log('Passed email integration: no historical sends, atomic Prisma/legacy enqueue and rollback, deduplication, channel visibility, concurrent workers, retries/backoff, permanent failure, lease recovery, inactive recipients and safe templates.');
}finally{await db.$disconnect();await sql.end();if(created)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
