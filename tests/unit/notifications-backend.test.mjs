import '../configuration-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { notificationsHandler } = await import('../../src/server/notifications-http.ts');
const { notificationQuery, notificationBody } = await import('../../src/server/notification-validation.ts');
const { ConfigurationError } = await import('../../src/server/configuration-validation.ts');
const { deleteNotifications } = await import('../../src/server/services/notifications.ts');
const id='11111111-1111-4111-8111-111111111111';
const user={id,permissions:['notifications.read.own','notifications.update.own']};
const forbidden=()=>assert.fail('Unauthorized request touched persistence');
const request=(operation,options={})=>new Request('http://localhost/api/notifications'+(options.query??''),{
 method:operation==='read'?'PATCH':operation==='all'?'POST':'GET',headers:{origin:'http://localhost', 'content-type':'application/json',...options.headers},
 ...(['read','all'].includes(operation)?{body:options.body??(operation==='read'?'{"read":true}':'{}')}:{}),
});
test('all notification endpoints enforce active identity and exact own grants before persistence',async()=>{
 for(const operation of ['list','count','read','all']){
  for(const [actor,status]of [[null,401],[{id,permissions:['test:admin','notifications.send']},403]]){
   const response=await notificationsHandler(operation,{getUser:async()=>actor,execute:forbidden})(request(operation),id);
   assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');
  }
 }
 for(const operation of ['read','all'])assert.equal((await notificationsHandler(operation,{getUser:async()=>({...user,permissions:['notifications.read.own']}),execute:forbidden})(request(operation),id)).status,403);
});
test('writes reject cross-origin, malformed/extra JSON, unsupported media and oversized bodies',async()=>{
 const handle=notificationsHandler('read',{getUser:async()=>user,execute:forbidden});
 for(const [options,status]of [
  [{headers:{origin:'https://evil.test'}},403],[{headers:{'sec-fetch-site':'cross-site'}},403],
  [{headers:{'content-type':'text/plain'}},415],[{body:'invalid'},400],[{body:'{"read":"true"}'},400],
  [{body:'{"read":true,"userId":"other"}'},400],[{body:'x'.repeat(4097)},413],
 ])assert.equal((await handle(request('read',options),id)).status,status);
 assert.throws(()=>notificationBody({read:true},false));
});
test('delete enforces write permissions, same origin and a bounded UUID list',async()=>{
 const make=(body,origin='http://localhost')=>new Request('http://localhost/api/notifications',{method:'DELETE',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 const handle=notificationsHandler('delete',{getUser:async()=>user,execute:async()=>({deletedCount:1,unreadCount:0})});
 assert.equal((await handle(make({notificationIds:[id]}))).status,200);
 assert.equal((await handle(make({notificationIds:[id]},'https://evil.test'))).status,403);
 for(const body of [{},{notificationIds:[]},{notificationIds:['bad']},{notificationIds:Array(101).fill(id)},{notificationIds:[id],userId:'other'}])assert.equal((await handle(make(body))).status,400);
 const denied=notificationsHandler('delete',{getUser:async()=>({...user,permissions:['notifications.read.own']}),execute:forbidden});
 assert.equal((await denied(make({notificationIds:[id]}))).status,403);
});

test('deletion scopes persistence to own visible records and retains event/outbox rows',async()=>{
 const calls=[];
 const db={notification:{updateMany:async args=>{calls.push(args);return {count:1};},count:async args=>{calls.push(args);return 3;}}};
 assert.deepEqual(await deleteNotifications(db,user,{notificationIds:[id,id]}),{deletedCount:1,unreadCount:3});
 assert.deepEqual(calls,[{where:{userId:user.id,inAppEnabled:true,notificationId:{in:[id]}},data:{inAppEnabled:false}},{where:{userId:user.id,inAppEnabled:true,isRead:false}}]);
 await assert.rejects(deleteNotifications(db,{...user,permissions:[]},{notificationIds:[id]}),e=>e.status===403);
 assert.equal(calls.length,2);
});

test('queries reject identity overrides, duplicate filters, empty/invalid pagination and count query fields',()=>{
 for(const query of ['userId=other','read=read','read=all&read=unread','limit=0','limit=101','limit=1.5','cursor='])assert.throws(()=>notificationQuery(new URLSearchParams(query),true));
 assert.throws(()=>notificationQuery(new URLSearchParams('read=all'),false));
 assert.equal(notificationQuery(new URLSearchParams(),true).limit,20);
});
test('HTTP successes and failures use the contracted envelopes without leaking persistence details',async()=>{
 for(const operation of ['list','count','read','all']){
  const ok=await notificationsHandler(operation,{getUser:async()=>user,execute:async()=>({ok:true})})(request(operation),id);assert.equal(ok.status,200);
 }
 for(const [error,status]of [[new Error('SECRET database error'),503],[new ConfigurationError(404,'NOT_FOUND','Notification not found.'),404],[Object.assign(new Error('conflict'),{code:'P2034'}),409]]){
  const response=await notificationsHandler('read',{getUser:async()=>user,execute:async()=>{throw error;}})(request('read'),id);
  assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/SECRET/);
 }
});
