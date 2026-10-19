// Run against a development server connected to the seeded local database.
// Creates only test sessions; does not modify database records.
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
function client() {
  const cookies = new Map();
  return async (path, options = {}) => {
    const response = await fetch(`${base}${path}`, {...options,redirect:'manual',
      headers:{...options.headers,cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}});
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0], split = pair.indexOf('=');
      cookies.set(pair.slice(0,split),pair.slice(split+1));
    }
    return response;
  };
}
async function login(request, username, password, csrf = true) {
  const token = csrf ? (await (await request('/api/auth/csrf')).json()).csrfToken : '';
  return request('/api/auth/callback/credentials',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},
    body:new URLSearchParams({csrfToken:token,username,password,callbackUrl:`${base}/test`})});
}
assert.equal((await client()('/api/me')).status,401);
for (const [username,role,permission] of [
  ['alder_sol','Faculty','signups.create.own'],
  ['amber_arrow','AC','cycles.manage'],
  ['arden_stone','Admin','users.manage'],
]) {
  const request = client();
  await login(request,username.toUpperCase(),'123');
  const response = await request('/api/me');
  assert.equal(response.status,200,`Login failed for ${username}`);
  const me = await response.json();
  assert.equal(me.username,username);assert(me.roles.includes(role));assert(me.permissions.includes(permission));
  assert.match(me.id,/^[a-f0-9-]{36}$/i);assert.equal('passwordHash' in me,false);
  for(const area of ['faculty','ac','admin']) {
    const allowed = role==='Admin' || area==='faculty' || (role==='AC' && area==='ac');
    assert.equal((await request(`/api/test/${area}`)).status,allowed?200:403);
  }
  const csrfToken = (await (await request('/api/auth/csrf')).json()).csrfToken;
  await request('/api/auth/signout',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken})});
  assert.equal((await request('/api/me')).status,401);
}
for(const [username,password,csrf]of [['alder_sol','wrong',true],['no_such_seed_account','123',true],['alder_sol','123',false]]) {
  const request = client();await login(request,username,password,csrf);assert.equal((await request('/api/me')).status,401);
}
console.log('Passed seeded Faculty/AC/Admin login, database business grants, fixture API access, unknown account, wrong password, CSRF and logout.');
