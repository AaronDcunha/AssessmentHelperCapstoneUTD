// Run against a development server connected to the seeded local database.
// Creates only test sessions; does not modify database records.
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const demoMode = process.env.TEST_AUTH_MODE === 'demo';
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
    body:new URLSearchParams({csrfToken:token,username,password,callbackUrl:base})});
}
assert.equal((await client()('/api/me')).status,401);
const home = await client()('/');
assert.equal(home.status,307);
assert.equal(new URL(home.headers.get('location'),base).pathname,'/dashboard');
for(const path of ['/dashboard','/dashboard/evaluation','/observations','/observations/history','/test','/auth-test']) {
  const response = await client()(path);
  assert.equal(response.status,307);
  assert.equal(new URL(response.headers.get('location'),base).pathname,'/login');
}
for (const [username,role,permission] of (demoMode ? [
  ['faculty','Faculty','profile.read.own'],
  ['ac','AC','observations.read.own'],
  ['admin','Admin','test:admin'],
] : [
  ['alder_sol','Faculty','signups.create.own'],
  ['amber_arrow','AC','cycles.manage'],
  ['arden_stone','Admin','users.manage'],
])) {
  const request = client();
  const signedIn = await login(request,username.toUpperCase(),'123');
  assert.equal(new URL((await signedIn.json()).url).pathname,'/dashboard');
  const response = await request('/api/me');
  assert.equal(response.status,200,`Login failed for ${username}`);
  const me = await response.json();
  assert.equal(me.username,username);assert(me.roles.some(value=>value.toLowerCase()===role.toLowerCase()));assert(me.permissions.includes(permission));
  assert.match(me.id,demoMode ? /^demo:/ : /^[a-f0-9-]{36}$/i);assert.equal('passwordHash' in me,false);
  const loginPage = await request('/login');
  assert.equal(new URL(loginPage.headers.get('location'),base).pathname,'/dashboard');
  for(const path of ['/dashboard','/dashboard/evaluation','/observations/requests','/observations','/observations/history']) {
    const page = await request(path); assert.equal(page.status,200,`${username} ${path}`);
    const html = await page.text();
    assert(html.includes('data-navigation-section="faculty"'));
    assert.equal(html.includes('data-navigation-section="admin"'),role==='Admin');
    assert(html.includes(me.name));
    if(role==='Admin'){assert(html.includes('href="/test"'));assert(html.includes('href="/auth-test"'));}
  }
  for(const path of ['/test','/auth-test']) {
    const page = await request(path); assert.equal(page.status,role==='Admin'?200:307);
    if(role!=='Admin')assert.equal(new URL(page.headers.get('location'),base).pathname,'/forbidden');
  }
  for(const area of ['faculty','ac','admin']) {
    const allowed = role==='Admin' || area==='faculty' || (role==='AC' && area==='ac');
    assert.equal((await request(`/api/test/${area}`)).status,allowed?200:403);
  }
  const csrfToken = (await (await request('/api/auth/csrf')).json()).csrfToken;
  await request('/api/auth/signout',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken})});
  assert.equal((await request('/api/me')).status,401);
}
// Unknown account/wrong-password database checks require PostgreSQL even in mock mode.
for(const [username,password,csrf]of (demoMode ? [['faculty','123',false]] : [['alder_sol','wrong',true],['no_such_seed_account','123',true],['alder_sol','123',false]])) {
  const request = client();await login(request,username,password,csrf);assert.equal((await request('/api/me')).status,401);
}
console.log(`Passed ${demoMode?'development':'seeded'} Faculty/AC/Admin login, default redirects, Faculty routes and navigation, Admin-only test pages, API access, CSRF and logout.`);
