import '../configuration-loader.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {PrismaPg} from '@prisma/adapter-pg';
const {PrismaClient}=await import('../../src/generated/prisma/client.ts');
const {sendNotification}=await import('../../src/server/services/notification-delivery.ts');
const url=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));url.searchParams.delete('schema');
const schema='notification_helper_test_'+randomUUID().replaceAll('-','');
const admin=new pg.Pool({connectionString:url.toString(),connectionTimeoutMillis:5000});
const migration=new pg.Pool({connectionString:url.toString(),options:`-c search_path=${schema}`,connectionTimeoutMillis:5000});
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()},{schema})});
const previousPrisma=globalThis.configurationPrisma;
globalThis.configurationPrisma=db; // Standalone helper must also use only this disposable schema.
const [faculty,ac1,ac2,administrator,inactive,custom,readOnly,missing]=Array.from({length:8},()=>randomUUID());
const base={eventKey:'specific',type:'HELPER_TEST',title:'Helper test',message:'Full notification message'};
const notify=input=>db.$transaction(tx=>sendNotification({...base,...input},tx));
const queueCount=eventKey=>db.notificationEmail.count({where:{notification:{eventKey}}});
let created=false;
try{
 await admin.query(`CREATE SCHEMA ${schema}`);created=true;
 const root=new URL('../../prisma/migrations/',import.meta.url);
 for(const directory of (await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
  await migration.query((await readFile(new URL(`${directory.name}/migration.sql`,root),'utf8')).replace('CREATE SCHEMA IF NOT EXISTS "public";',''));
 }
 const names=['Faculty','AC One','AC Two','Admin','Inactive AC','Combined custom','Read only'];
 await db.appUser.createMany({data:[faculty,ac1,ac2,administrator,inactive,custom,readOnly].map((userId,i)=>({userId,fullName:names[i],email:`helper-${i}@example.invalid`,isActive:userId!==inactive}))});
 const role={};for(const name of ['Faculty','AC','Admin','Reader','Sender'])role[name]=await db.role.create({data:{roleName:name}});
 for(const name of ['observations.read','notifications.send']){
  const permission=await db.permission.upsert({where:{permissionName:name},create:{permissionName:name},update:{}});
  await db.rolePermission.create({data:{roleId:role[name==='observations.read'?'Reader':'Sender'].roleId,permissionId:permission.permissionId}});
 }
 await db.userRole.createMany({data:[[faculty,'Faculty'],[ac1,'AC'],[ac2,'AC'],[ac2,'Admin'],[administrator,'Admin'],[inactive,'AC'],[custom,'Reader'],[custom,'Sender'],[readOnly,'Reader']].map(([userId,name])=>({userId,roleId:role[name].roleId}))});
 const direct=await notify({recipients:{userId:faculty}});assert.deepEqual(direct.recipientIds,[faculty]);assert.equal(await queueCount('specific'),0,'Email is opt-in');
 assert.deepEqual((await notify({recipients:{userId:faculty}})).notificationIds,direct.notificationIds,'Retry keeps one notification');
 const allAC=await notify({eventKey:'all-ac',recipients:{role:'AC'},email:true});assert.deepEqual(allAC.recipientIds.sort(),[ac1,ac2,administrator].sort());assert.equal(await queueCount('all-ac'),3);
 const union=await notify({eventKey:'union',recipients:[{role:'AC'},{userIds:[ac1,inactive,missing,faculty,faculty]}]});assert.equal(union.recipientCount,4);assert.deepEqual(union.skippedUserIds.sort(),[inactive,missing].sort());assert.equal(await queueCount('union'),0);
 const permissionAudience=await notify({eventKey:'custom',recipients:{permissions:['observations.read','notifications.send']},email:true});assert.deepEqual(permissionAudience.recipientIds,[custom],'Permissions from separately assigned roles combine');assert.equal(await queueCount('custom'),1);
 const combined=await notify({eventKey:'ac-plus-custom',recipients:[{role:'AC'},{permissions:['observations.read','notifications.send']}]});assert.deepEqual(combined.recipientIds.sort(),[ac1,ac2,administrator,custom].sort());
 const inherited=await notify({eventKey:'all-faculty',recipients:{role:'Faculty'}});assert.deepEqual(inherited.recipientIds.sort(),[faculty,ac1,ac2,administrator].sort());
 const onlyEmail=await notify({eventKey:'email-only',recipients:{userId:faculty},inApp:false,email:true});const hidden=await db.notification.findUniqueOrThrow({where:{notificationId:onlyEmail.notificationIds[0]}});assert.equal(hidden.inAppEnabled,false);assert.equal(hidden.emailRequested,true);assert.equal(await queueCount('email-only'),1);
 await notify({eventKey:'specific',recipients:{userId:faculty},email:true,message:'Changed on retry'});assert.equal(await queueCount('specific'),0,'Retry cannot change the original channel/content decision');assert.equal((await db.notification.findUniqueOrThrow({where:{notificationId:direct.notificationIds[0]}})).message,base.message);
 assert.equal((await notify({eventKey:'empty',recipients:{userIds:[]}})).recipientCount,0);assert.equal((await notify({eventKey:'unknown-role',recipients:{role:'Missing role'}})).recipientCount,0);
 const before=await db.notification.count();for(const extra of [{recipients:{userId:'bad'}},{recipients:{permissions:[]}},{recipients:{}},{recipients:{role:'AC'},email:false,inApp:false},{recipients:{role:'AC'},email:'true'},{recipients:{userIds:[]},title:'x'.repeat(2001)}])await assert.rejects(notify(extra));assert.equal(await db.notification.count(),before);
 await assert.rejects(db.$transaction(async tx=>{await sendNotification({...base,eventKey:'rollback',recipients:{role:'AC'},email:true},tx);throw Error('Rollback');}));assert.equal(await db.notification.count({where:{eventKey:'rollback'}}),0);assert.equal(await queueCount('rollback'),0);
 const standalone=await sendNotification({...base,eventKey:'standalone',recipients:{userId:faculty},email:true});assert.equal(standalone.recipientCount,1);assert.equal(await queueCount('standalone'),1);
 const concurrent={...base,eventKey:'concurrent',recipients:{userId:faculty},email:true};await Promise.allSettled([sendNotification(concurrent),sendNotification(concurrent)]);await sendNotification(concurrent);assert.equal(await db.notification.count({where:{eventKey:'concurrent'}}),1);assert.equal(await queueCount('concurrent'),1);
 if(process.argv.includes('--mailpit')){
  const {registerHooks}=await import('node:module');registerHooks({resolve(s,c,n){return s==='server-only'?{url:'data:text/javascript,export{}',shortCircuit:true}:n(s,c);}});
  const {createEmailTransport}=await import('../../src/server/email/transport.ts');const {deliverNotificationEmails}=await import('../../src/server/jobs/email-delivery.ts');
  await db.notificationEmail.updateMany({where:{status:'pending'},data:{status:'skipped',lastError:'TEST_FIXTURE'}});
  const token=randomUUID();await sendNotification({...base,eventKey:'mailpit-'+token,title:'Shared helper Mailpit '+token,recipients:{role:'AC'},email:true});
  const transport=createEmailTransport({SMTP_HOST:'127.0.0.1',SMTP_PORT:'1025',SMTP_SECURE:'false'});
  try{const delivered=await deliverNotificationEmails(db,async message=>{const info=await transport.sendMail(message);assert.equal(info.rejected.length,0);});assert.equal(delivered.sent,3);}finally{transport.close();}
  const response=await fetch('http://127.0.0.1:8025/api/v1/search?query='+encodeURIComponent(token));assert.equal(response.status,200);const messages=(await response.json()).messages;assert.equal(messages.length,3);assert.deepEqual(messages.flatMap(m=>m.To.map(to=>to.Address)).sort(),['helper-1@example.invalid','helper-2@example.invalid','helper-3@example.invalid']);assert.ok(messages.every(m=>m.From.Address==='noreply_course_evaluation@assessmenthelper.edu'));
  console.log('Mailpit verified: the shared helper delivered one email to each of all three active AC/Admin recipients, with no duplicate for the multi-role account.');
 }
 console.log('Passed shared notification helper: specific users, lists, role inheritance, combined permission audiences, active filtering, overlap deduplication, optional/email-only delivery, stable retries, validation, workflow rollback and standalone transactions.');
}finally{globalThis.configurationPrisma=previousPrisma;await db.$disconnect();await migration.end();if(created)await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
