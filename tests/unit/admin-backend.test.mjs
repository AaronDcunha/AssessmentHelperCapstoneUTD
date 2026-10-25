import '../configuration-loader.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const {adminHandler}=await import('../../src/server/admin-http.ts');
const {grants,userInput,levelInput,effectivePermissions}=await import('../../src/server/admin-validation.ts');
const {mutateAdmin}=await import('../../src/server/services/admin.ts');
const {readAdmin}=await import('../../src/server/queries/admin.ts');
const id='00000000-0000-4000-8000-000000000001';
const identity={id,permissions:[...new Set(Object.values(grants).flat())]};
function request(operation,headers={},body='{}') {
 const method=operation.endsWith('.list')||operation.endsWith('.get')?'GET':operation.endsWith('.delete')?'DELETE':'POST';
 return new Request('http://localhost/api/admin',{method,headers:{origin:'http://localhost','content-type':'application/json',...headers},...(method==='POST'?{body}:{})});
}
const forbidden=()=>assert.fail('Denied request accessed persistence');
test('all 13 endpoints enforce authentication and exact grants before persistence',async()=>{
 for(const operation of Object.keys(grants)) {
  for(const [user,status] of [[null,401],[{id,permissions:['test:admin']},403]]) {
   assert.equal((await adminHandler(operation,{getUser:async()=>user,execute:forbidden})(request(operation))).status,status,operation);
  }
  const response=await adminHandler(operation,{getUser:async()=>identity,execute:async()=>({ok:true})})(request(operation));
  assert.equal(response.status,operation.endsWith('.create')?201:operation.endsWith('.delete')?204:200,operation);
  assert.equal(response.headers.get('cache-control'),'no-store');
 }
});
test('all writes require same origin; delete accepts an empty body',async()=>{
 for(const operation of Object.keys(grants).filter(o=>!o.endsWith('.get')&&!o.endsWith('.list'))) {
  for(const headers of [{origin:''},{origin:'https://evil.example'},{'sec-fetch-site':'cross-site'}])
   assert.equal((await adminHandler(operation,{getUser:async()=>identity,execute:forbidden})(request(operation,headers))).status,403);
 }
 const h=adminHandler('users.create',{getUser:async()=>identity,execute:forbidden});
 assert.equal((await h(request('users.create',{},'{'))).status,400);
 assert.equal((await h(request('users.create',{'content-type':'text/plain'}))).status,415);
 assert.equal((await h(request('users.create',{},' '.repeat(262145)))).status,413);
});
test('create requires roles.assign in addition to users.manage',async()=>{
 assert.equal((await adminHandler('users.create',{getUser:async()=>({id,permissions:['users.manage']}),execute:forbidden})(request('users.create'))).status,403);
});
test('validation preserves false and rejects mass assignment, invalid dates and intervals',()=>{
 const b={name:'Example',email:'Example@Test.edu',accountStatus:false,roleIds:[id]};
 assert.equal(userInput(b,true).data.isActive,false);
 assert.equal(userInput(b,true).data.email,'example@test.edu');
 for(const bad of [{...b,accountStatus:'false'},{...b,username:'injected'},{...b,roleIds:[id,id]},{...b,professor:{departmentId:id,hiringLevelId:id,hireDate:'2026-02-30'}}]) assert.throws(()=>userInput(bad,true));
 assert.throws(()=>userInput({expectedRevision:0,roleIds:[id]},false));
 for(const n of [0,-1,1.5,2147483648,'1']) assert.throws(()=>levelInput({name:'Rank',evaluationIntervalYears:n},true));
 assert.equal(levelInput({name:'Rank',evaluationIntervalYears:2},true).data.evaluationIntervalYears,2);
});
test('direct grants remain distinct from effective inherited grants',()=>{
 const roles=['Faculty','AC','Admin','Custom'].map((roleName,i)=>({roleId:String(i),roleName,rolePermissions:[{permission:{permissionName:roleName+'.read'}}]}));
 assert.deepEqual(effectivePermissions(roles,['2']),['AC.read','Admin.read','Faculty.read']);
 assert.deepEqual(effectivePermissions(roles,['1']),['AC.read','Faculty.read']);
 assert.deepEqual(effectivePermissions(roles,['3']),['Custom.read']);
});
test('queries and mutations independently enforce permissions',async()=>{
 const db=new Proxy({}, {get:forbidden}),user={id,permissions:[]};
 for(const operation of Object.keys(grants)) {
  const run=operation.endsWith('.get')||operation.endsWith('.list')?()=>readAdmin(db,user,operation,new URL('http://test'),{}):()=>mutateAdmin(db,user,operation,{},{});
  await assert.rejects(run,e=>e.status===403);
 }
});
test('stale role replacement stops before deleting assignments',async()=>{
 const db={role:{findMany:async()=>[],count:async()=>1},appUser:{findMany:async()=>[],findUnique:async()=>({userId:id}),updateMany:async()=>({count:0})},userRole:{deleteMany:forbidden}};
 const prisma={$transaction:async run=>run(db)};
 await assert.rejects(()=>mutateAdmin(prisma,identity,'users.roles',{userId:id},{roleIds:[id],expectedRevision:0}),e=>e.status===409);
});
test('user list applies false status, profile and role filters with stable pagination',async()=>{
 let args;
 const db={appUser:{findMany:async a=>{args=a;return [];}}};
 await readAdmin(db,identity,'users.list',new URL(`http://test?accountStatus=false&roleId=${id}&departmentId=${id}&hiringLevelId=${id}&limit=1&cursor=${id}`),{});
 assert.equal(args.where.isActive,false); assert.equal(args.where.userRoles.some.roleId,id);
 assert.equal(args.where.professor.is.departmentId,id); assert.equal(args.take,2); assert.equal(args.where.userId.gt,id);
 await assert.rejects(()=>readAdmin(db,identity,'users.list',new URL('http://test?accountStatus=Inactive'),{}),e=>e.status===422);
});
const {preserveAdminAccess}=await import('../../src/server/admin-safeguards.ts');
test('self and last-active-admin safeguards prevent lockout, including shared role grant edits',()=>{
 const before={managers:[id],actorAdmin:true,actorPermissions:['users.manage','roles.assign','role-permissions.manage']};
 assert.throws(()=>preserveAdminAccess(before,{managers:[],actorAdmin:false,actorPermissions:[]}),e=>e.status===409);
 assert.throws(()=>preserveAdminAccess(before,{...before,managers:['other'],actorPermissions:['users.manage','roles.assign']}),e=>e.status===409);
 assert.throws(()=>preserveAdminAccess({...before,actorAdmin:false},{managers:[],actorAdmin:false,actorPermissions:[]}),e=>e.status===409);
 assert.doesNotThrow(()=>preserveAdminAccess(before,{...before,managers:[id,'other']}));
 assert.doesNotThrow(()=>preserveAdminAccess({managers:[],actorAdmin:false,actorPermissions:[]},{managers:[id],actorAdmin:false,actorPermissions:[]}));
});
test('database conflicts and missing records return structured safe errors',async()=>{
 for(const [code,status] of [['P2002',409],['P2003',409],['P2034',409],['P2025',404]]) {
  const h=adminHandler('users.get',{getUser:async()=>identity,execute:async()=>{throw {code};}});
  const r=await h(request('users.get')); assert.equal(r.status,status); assert.equal(typeof (await r.json()).error.message,'string');
 }
});
