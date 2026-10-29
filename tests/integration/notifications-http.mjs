// Read-only HTTP checks against seeded users; no notification content or credentials are logged.
import '../configuration-loader.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const {parseNotificationPage}=await import('../../src/lib/notifications-api.ts');
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

const anonymous=await fetch(base+'/api/notifications');assert.equal(anonymous.status,401);assert.equal((await anonymous.json()).error.code,'UNAUTHENTICATED');
for(const role of ['Faculty','AC','Admin']){
 const {request}=await login(role);
 const result=await request('/api/notifications');assert.equal(result.status,200,role+' list');assert.equal(result.headers.get('cache-control'),'private, no-store');const page=parseNotificationPage(await result.json());
 const count=await request('/api/notifications/unread-count');assert.equal(count.status,200);assert.equal((await count.json()).unreadCount,page.unreadCount);
 const invalid=await request('/api/notifications?userId=other');assert.equal(invalid.status,400);
 const denied=await request('/api/notifications/mark-all-read',{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:'{}'});assert.equal(denied.status,403);
 const missing=await request('/api/notifications/'+randomUUID(),{method:'PATCH',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({read:true})});assert.equal(missing.status,404);
}
console.log('Passed live notification HTTP checks: anonymous denial; Faculty/AC/Admin database reads and unread-count agreement; private responses; identity-override rejection; cross-origin mutation rejection; generic missing-notification 404. No notification records changed and no email was sent.');
