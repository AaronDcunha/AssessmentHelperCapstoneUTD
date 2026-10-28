// Read-only HTTP verification against a running, seeded development server.
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL??'http://localhost:3000';
const missingId='00000000-0000-4000-8000-000000000000';
const routes=[
  ['GET','/api/evaluation-cycles'],['GET',`/api/evaluation-cycles/${missingId}`],
  ['POST','/api/evaluation-cycles'],['PATCH',`/api/evaluation-cycles/${missingId}`],
  ['GET','/api/semesters'],['PUT',`/api/evaluation-cycles/${missingId}/settings`],
  ['GET','/api/observation-templates'],['GET','/api/observation-templates/current'],
  ['GET',`/api/observation-templates/${missingId}`],['POST','/api/observation-templates'],
  ['PATCH',`/api/observation-templates/${missingId}`],['POST',`/api/observation-templates/${missingId}/publish`],
];
function client() {
  const cookies=new Map();
  return async(path,options={})=>{
    const response=await fetch(base+path,{...options,redirect:'manual',headers:{...options.headers,cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}});
    for(const cookie of response.headers.getSetCookie()) {const pair=cookie.split(';')[0],split=pair.indexOf('=');cookies.set(pair.slice(0,split),pair.slice(split+1));}
    return response;
  };
}
function options(method) {return {method,headers:{origin:new URL(base).origin,'content-type':'application/json'},...(method!=='GET'?{body:'{}'}:{})};}
async function login(request,username) {
  const csrfToken=(await(await request('/api/auth/csrf')).json()).csrfToken;
  await request('/api/auth/callback/credentials',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},
    body:new URLSearchParams({csrfToken,username,password:'123',callbackUrl:base})});
  assert.equal((await request('/api/me')).status,200,`Unable to log in as ${username}`);
}
for(const [method,path] of routes) assert.equal((await client()(path,options(method))).status,401,`Anonymous ${method} ${path}`);
for(const [username,manager] of [['alder_sol',false],['amber_arrow',true],['arden_stone',true]]) {
  const request=client();await login(request,username);
  for(const [method,path] of routes) {
    const response=await request(path,options(method));
    assert.equal(response.headers.get('cache-control'),'no-store');
    if(method!=='GET') assert.equal(response.status,manager?422:403,`${username} ${method} ${path}`);
    else if(path.includes(missingId)) assert.equal(response.status,404);
    else if(path.endsWith('/current')) assert([200,404].includes(response.status));
    else assert.equal(response.status,200,`${username} ${path}`);
  }
  const cycles=await(await request('/api/evaluation-cycles')).json();
  for(const cycle of cycles.items) {
    assert.equal(typeof cycle.semester.name,'string');
    assert.equal((await request(`/api/evaluation-cycles/${cycle.id}`)).status,200);
  }
  const templates=await(await request('/api/observation-templates')).json();
  for(const template of templates.items) {
    if(!manager) assert.equal(template.status,'published');
    assert.equal((await request(`/api/observation-templates/${template.id}`)).status,200);
  }
  for(const [method,path] of routes.filter(([m])=>m!=='GET')) {
    if(manager) {
      const response=await request(path,{...options(method),headers:{'content-type':'application/json',origin:'https://attacker.example'}});
      assert.equal(response.status,403,`Foreign origin ${path}`);
    }
  }
}
console.log('Passed live HTTP anonymous/Faculty/AC/Admin access matrix for all 12 configuration routes, same-origin checks, semester names and record reads. No application records modified.');
