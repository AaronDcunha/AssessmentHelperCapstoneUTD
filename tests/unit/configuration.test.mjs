import '../configuration-loader.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { configurationHandler } = await import('../../src/server/configuration-http.ts');
const { ConfigurationError, criteria, date, deadlines, pagination, timestamp } = await import('../../src/server/configuration-validation.ts');
const { createCycle, updateCycle, updateSettings, createTemplate, updateTemplate, publishTemplate } = await import('../../src/server/services/configuration.ts');
const { getCycles, getSemesters, getTemplates, getTemplate, getCurrentTemplate } = await import('../../src/server/queries/configuration.ts');

const id='00000000-0000-4000-8000-000000000001';
const deadlineBody={signupDeadline:'2026-10-31T23:59:00Z',observationDeadline:'2026-11-30T23:59:00Z',feedbackDeadline:'2026-12-07T23:59:00Z'};
const user={id,permissions:['cycles.manage','templates.manage']};
const faculty={id,permissions:['course-sections.read.own','signups.read.own','observations.read.own','assessment.read.own']};
const origin='http://localhost:3000';
const operations=['cycles.list','cycles.get','cycles.create','cycles.update','cycles.settings','semesters.list',
  'templates.list','templates.get','templates.current','templates.create','templates.update','templates.publish'];
const writes=new Set(['cycles.create','cycles.update','cycles.settings','templates.create','templates.update','templates.publish']);
function request(operation,headers={},body='{}') {
  return new Request(origin+'/api/configuration',{method:writes.has(operation)?'POST':'GET',
    headers:{'content-type':'application/json',origin,...headers},...(writes.has(operation)?{body}:{})});
}
function handler(operation,identity,execute=()=>assert.fail('Unauthorized request reached the database')) {
  return configurationHandler(operation,{getUser:async()=>identity,execute});
}
test('every configuration route rejects anonymous and unprivileged users before database access',async()=>{
  for(const operation of operations) {
    assert.equal((await handler(operation,null)(request(operation))).status,401,operation);
    assert.equal((await handler(operation,{id,permissions:[]})(request(operation))).status,403,operation);
    if(writes.has(operation)) assert.equal((await handler(operation,faculty)(request(operation))).status,403,operation);
  }
});
test('effective permissions authorize all routes without relying on role names',async()=>{
  for(const operation of operations) {
    let calls=0;
    const response=await handler(operation,user,async()=>{calls++;return {id};})(request(operation));
    assert.equal(response.status,operation.endsWith('.create')?201:200,operation);
    assert.equal(calls,1); assert.equal(response.headers.get('cache-control'),'no-store');
  }
  const response=await handler('templates.get',faculty,async()=>({id}))(request('templates.get'));
  assert.equal(response.status,200);
});
test('mutations reject missing/foreign origin, malformed JSON and unsupported content types',async()=>{
  for(const operation of operations.filter(o=>writes.has(o))) {
    for(const headers of [{origin:''},{origin:'https://attacker.example'},{'sec-fetch-site':'cross-site'}]) {
      assert.equal((await handler(operation,user)(request(operation,headers))).status,403);
    }
    assert.equal((await handler(operation,user)(request(operation,{},'{'))).status,400);
    assert.equal((await handler(operation,user)(request(operation,{'content-type':'text/plain'}))).status,415);
    assert.equal((await handler(operation,user)(request(operation,{},' '.repeat(262145)))).status,413);
  }
});
test('structured errors distinguish stale edits, duplicates and unavailable records',async()=>{
  for(const [error,status,code] of [[new ConfigurationError(404,'NOT_FOUND','Missing'),404,'NOT_FOUND'],
    [{code:'P2002'},409,'DUPLICATE'],[{code:'P2034'},409,'CONCURRENT_UPDATE']]) {
    const response=await handler('cycles.get',user,async()=>{throw error;})(request('cycles.get'));
    assert.equal(response.status,status); assert.equal((await response.json()).error.code,code);
  }
});
test('dates, deadlines, rating options and pagination reject invalid business input',()=>{
  for(const value of ['2026-02-29','2026-13-01','2026-04-31',null]) assert.throws(()=>date(value),ConfigurationError);
  assert.equal(date('2028-02-29'),'2028-02-29');
  for(const value of ['2026-02-30T10:00:00Z','2026-10-31T12:00:00-05:00',null]) assert.throws(()=>timestamp(value),ConfigurationError);
  assert.throws(()=>deadlines({...deadlineBody,feedbackDeadline:deadlineBody.signupDeadline}),ConfigurationError);
  assert.equal(deadlines(deadlineBody).signupDeadline,'2026-10-31T23:59:00.000Z');
  for(const query of ['?limit=0','?limit=101','?limit=1.5','?cursor=bad']) assert.throws(()=>pagination(new URL(origin+query)),ConfigurationError);
  const q={key:'a',prompt:'Question',type:'rating',required:true,order:0,options:[{value:1,label:'Low'},{value:2,label:'High'}]};
  assert.equal(criteria([q]).length,1);
  for(const questions of [[],[q,q],[{...q,options:[{value:1,label:'a'},{value:1,label:'b'}]}],[{...q,required:'true'}]]) assert.throws(()=>criteria(questions),ConfigurationError);
});
test('services enforce permissions independently of route handlers',async()=>{
  const db=new Proxy({}, {get:()=>assert.fail('Unauthorized Prisma access')});
  const forbidden={id,permissions:[]};
  for(const run of [()=>createCycle(db,forbidden,{}),()=>updateCycle(db,forbidden,id,{}),()=>updateSettings(db,forbidden,id,{}),
    ()=>createTemplate(db,forbidden,{}),()=>updateTemplate(db,forbidden,id,{}),()=>publishTemplate(db,forbidden,id,{}),
    ()=>getCycles(db,forbidden,new URL(origin)),()=>getSemesters(db,forbidden,new URL(origin)),
    ()=>getTemplates(db,forbidden,new URL(origin)),()=>getTemplate(db,forbidden,id),()=>getCurrentTemplate(db,forbidden,new URL(origin))]) {
    await assert.rejects(run,error=>error.status===403);
  }
});

