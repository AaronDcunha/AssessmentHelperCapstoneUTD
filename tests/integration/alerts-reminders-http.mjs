// Read-only HTTP checks against seeded users; no notification content or credentials are logged.
import '../configuration-loader.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const base=process.env.TEST_BASE_URL??'http://localhost:3000';assert.equal(new URL(base).hostname,'localhost');
const credentials = readFileSync(new URL("../../prisma/demo-accounts.txt", import.meta.url), "utf8");
async function login(role) {
  const section = credentials.split(new RegExp(`^${role}:`, "m"))[1]?.split(/\r?\n\r?\n/)[0];
  const username = section?.match(/^Username: (.+)$/m)?.[1].trim();
  const password = section?.match(/^Password: (.+)$/m)?.[1].trim();
  assert.ok(username && password, "Ignored seeded credentials are required.");
  const jar = new Map();
  async function request(path, options = {}) {
    const result = await fetch(`${base}${path}`, { ...options, redirect: "manual", headers: {
      ...options.headers, Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
    } });
    for (const cookie of result.headers.getSetCookie()) {
      const pair = cookie.split(";")[0]; const index = pair.indexOf("=");
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return result;
  }
  const csrfToken = (await (await request("/api/auth/csrf")).json()).csrfToken;
  await request("/api/auth/callback/credentials", { method: "POST", headers: {
    "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1",
  }, body: new URLSearchParams({ username, password, csrfToken, callbackUrl: base }) });
  assert.equal((await request("/api/me")).status, 200, "Seeded login must succeed.");
  return { jar, request };
}


const missingId=randomUUID();const paths=['/api/observations/'+missingId+'/alerts','/api/evaluation-cycles/'+missingId+'/alerts','/api/alerts/'+missingId,'/api/evaluation-cycles/'+missingId+'/notifications'];
for(const path of paths){const mutation=path.endsWith('/notifications')||path.includes('/observations/');const result=await fetch(base+path,{method:mutation?'POST':'GET',...(mutation?{headers:{origin:base,'content-type':'application/json'},body:'{}'}:{})});assert.equal(result.status,401);}
for(const role of ['Faculty','AC','Admin']){
 const {request}=await login(role);const broad=role!=='Faculty';
 const cycles=await request('/api/evaluation-cycles?limit=1');assert.equal(cycles.status,200);const firstCycle=(await cycles.json()).items[0]?.id;
 if(firstCycle){const list=await request('/api/evaluation-cycles/'+firstCycle+'/alerts');assert.equal(list.status,broad?200:403);if(broad){assert.ok(Array.isArray((await list.json()).items));assert.equal(list.headers.get('cache-control'),'private, no-store');}}
 assert.equal((await request('/api/alerts/'+missingId)).status,404);
 const update=await request('/api/alerts/'+missingId,{method:'PATCH',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({status:'acknowledged',expectedRevision:0})});assert.equal(update.status,405);
 const create=await request('/api/observations/'+missingId+'/alerts',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({reasonCode:'OTHER',reason:'Missing record check',details:''})});assert.equal(create.status,404);
 const mail=await request('/api/evaluation-cycles/'+missingId+'/notifications',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({kind:'custom',recipientFilter:{},channels:['email'],message:'No delivery'})});assert.equal(mail.status,broad?404:403);
}
console.log('Passed live alert/reminder HTTP checks: anonymous denial, Faculty ownership and AC/Admin read grants and removed lifecycle PATCH, private responses, missing-record errors, and missing-cycle email-request rejection. No alerts, reminders or emails were created.');
