// Read-only seeded sessions; PATCH requests are unauthorized or intentionally invalid.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
assert.equal(new URL(base).hostname,'localhost');
const credentials=readFileSync(new URL('../../prisma/demo-accounts.txt',import.meta.url),'utf8');
function session(){
 const jar=new Map();
 return async(path,options={})=>{
  const response=await fetch(base+path,{...options,redirect:'manual',headers:{...options.headers,cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}});
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}
  return response;
 };
}
async function login(role){
 const section=credentials.split(new RegExp(`^${role}:`,'m'))[1]?.split(/\r?\n\r?\n/)[0];
 const username=section?.match(/^Username: (.+)$/m)?.[1].trim(),password=section?.match(/^Password: (.+)$/m)?.[1].trim();
 assert.ok(username&&password);
 const request=session();const csrfToken=(await(await request('/api/auth/csrf')).json()).csrfToken;
 await request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body:new URLSearchParams({username,password,csrfToken,callbackUrl:base})});
 assert.equal((await request('/api/me')).status,200);
 return request;
}
const path='/api/evaluation-cycles/current/expired-acceptance-requests';
const page='/ac/late-acceptance-requests';
const patch=(request,body)=>request('/api/expired-acceptance-requests/11111111-1111-4111-8111-111111111111',{method:'PATCH',headers:{'Content-Type':'application/json',origin:base},body:JSON.stringify(body)});
assert.equal((await session()(path)).status,401);
assert.equal((await patch(session(),{decision:'approved'})).status,401);
assert.equal((await session()(page)).status,307);
const faculty=await login('Faculty');
assert.equal((await faculty(path)).status,403);
assert.equal((await patch(faculty,{decision:'approved'})).status,403);
assert.equal((await faculty(page)).headers.get('location'),'/forbidden');
for(const role of ['AC','Admin']){
 const request=await login(role);
 const response=await request(path);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 const data=await response.json();assert.ok(Array.isArray(data.items));assert.equal(typeof data.summary.total,'number');
 assert.equal((await request(path+'?status=bad')).status,422);
 assert.equal((await request(path+'?requestId=bad')).status,400);
 assert.equal((await patch(request,{decision:'invalid'})).status,400);
 const cycles=await(await request('/api/evaluation-cycles')).json();
 for(const cycle of cycles.items){
  const explicit=await request(`/api/evaluation-cycles/${cycle.id}/expired-acceptance-requests`);
  console.log(`${role}: explicit cycle read status ${explicit.status}`);
  assert.equal(explicit.status,200);
 }
 assert.equal((await request(page)).status,200);
 console.log(`${role}: current cycle ${data.cycle ? 'configured' : 'not configured'}, ${data.items.length} live rows. No business mutations.`);
}
console.log('PASS: live API/page anonymous 401/redirect, Faculty 403, AC/Admin reads, no-store, query/body validation, and explicit cycle reads.');
