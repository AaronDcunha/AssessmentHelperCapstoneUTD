import '../configuration-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const {workflowHandler}=await import('../../src/server/alert-reminder-http.ts');
const {alertCreation,alertUpdate,reminderInput}=await import('../../src/server/alert-reminder-validation.ts');
const id='11111111-1111-4111-8111-111111111111';
const grants={'alert.create':['observations.read.own','invitations.send.own'],'alert.list':['observations.read'],'alert.get':['observations.read.own'],'alert.update':['observations.read','alerts.manage'],'reminder.send':['notifications.send','cycles.read']};
const forbidden=()=>assert.fail('Denied request reached persistence');
const request=(operation,headers={},body='{}')=>new Request('http://localhost/api/test',{method:operation==='alert.update'?'PATCH':operation==='alert.create'||operation==='reminder.send'?'POST':'GET',headers:{origin:'http://localhost','content-type':'application/json',...headers},...(['alert.create','alert.update','reminder.send'].includes(operation)?{body}:{})});
test('every new endpoint checks identity and exact business grants before persistence',async()=>{
 for(const operation of Object.keys(grants)){
  for(const [user,status]of [[null,401],[{id,permissions:['test:admin']},403]])assert.equal((await workflowHandler(operation,{getUser:async()=>user,execute:forbidden})(request(operation),id)).status,status);
  const result=await workflowHandler(operation,{getUser:async()=>({id,permissions:grants[operation]}),execute:async()=>operation==='alert.create'?{created:true,alert:{id}}:{ok:true}})(request(operation),id);
  assert.equal(result.status,operation==='alert.create'?201:200);assert.equal(result.headers.get('cache-control'),'private, no-store');
 }
});
test('mutations reject cross-origin, invalid JSON, oversized bodies and non-JSON content',async()=>{
 for(const operation of ['alert.create','alert.update','reminder.send']){
  const run=workflowHandler(operation,{getUser:async()=>({id,permissions:grants[operation]}),execute:forbidden});
  for(const [headers,body,status]of [[{origin:'https://evil.test'},'{}',403],[{'sec-fetch-site':'cross-site'},'{}',403],[{'content-type':'text/plain'},'{}',415],[{},'bad',400],[{},'x'.repeat(65537),413]])assert.equal((await run(request(operation,headers,body),id)).status,status);
 }
});
test('alert inputs preserve free-text reasons and enforce the agreed revision-based status actions',()=>{
 assert.deepEqual(alertCreation({reasonCode:'OTHER',reason:'Need help',details:'Context'}),{reason:'Need help',details:'Context'});
 assert.throws(()=>alertCreation({reasonCode:'invented',details:''}));
 assert.throws(()=>alertUpdate({status:'resolved'}));assert.throws(()=>alertUpdate({status:'pending',expectedRevision:0}));
 assert.equal(alertUpdate({status:'acknowledged',expectedRevision:0}).status,'ACKNOWLEDGED');
});
test('reminders accept delivery channels and validate recipient filters',()=>{
 assert.deepEqual(reminderInput({kind:'custom',recipientFilter:{},channels:['email','inApp']}).channels,['email','inApp']);
 assert.deepEqual(reminderInput({kind:'custom',recipientFilter:{}}).channels,['inApp','email']);
 assert.throws(()=>reminderInput({kind:'custom',recipientFilter:{},channels:[]}));
 assert.throws(()=>reminderInput({kind:'custom',recipientFilter:{userId:id}}));
 assert.throws(()=>reminderInput({kind:'custom',recipientFilter:{professorIds:[id,id]}}));
 assert.equal(reminderInput({kind:'custom',recipientFilter:{},message:'Please review'}).message,'Please review');
});
