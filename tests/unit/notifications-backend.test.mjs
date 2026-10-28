import '../configuration-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { notificationsHandler } = await import('../../src/server/notifications-http.ts');
const { notificationQuery, notificationBody } = await import('../../src/server/notification-validation.ts');
const { ConfigurationError } = await import('../../src/server/configuration-validation.ts');
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
