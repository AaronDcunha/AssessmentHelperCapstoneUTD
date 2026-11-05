// Controlled browser fixtures only. All configuration mutations are intercepted;
// only seeded authentication and server page guards use the application database.
// Requires the local app and an isolated Edge/Chrome CDP instance on port 9231.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
assert.equal(new URL(base).hostname, 'localhost');
const debug = process.env.TEST_CDP_URL ?? 'http://127.0.0.1:9231';
const credentials = readFileSync(new URL('../../prisma/demo-accounts.txt', import.meta.url), 'utf8');
const section = credentials.split(/^AC:/m)[1]?.split(/\r?\n\r?\n/)[0];
const username = section?.match(/^Username: (.+)$/m)?.[1].trim();
const password = section?.match(/^Password: (.+)$/m)?.[1].trim();
assert(username && password);
const jar = new Map();
async function request(path, options = {}) {
  const response = await fetch(base + path, { ...options, redirect: 'manual', headers: { ...options.headers, Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; ') } });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], at = pair.indexOf('='); jar.set(pair.slice(0, at), pair.slice(at + 1)); }
  return response;
}
const csrfToken = (await (await request('/api/auth/csrf')).json()).csrfToken;
await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body: new URLSearchParams({ username, password, csrfToken, callbackUrl: base }) });
assert.equal((await request('/api/me')).status, 200, 'Use the existing seeded AC login');
const target = await (await fetch(`${debug}/json/new?about:blank`, { method: 'PUT' })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map(), handlers = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) { const callback = pending.get(message.id); pending.delete(message.id); if (message.error) callback?.reject(new Error(message.error.message)); else callback?.resolve(message.result); }
  else handlers.get(message.method)?.(message.params);
};
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result?.value;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) {
  const until = Date.now() + 20000;
  while (Date.now() < until) { if (await evaluate(`!!(${expression})`)) return; await pause(75); }
  throw new Error(`Browser condition timed out: ${expression}`);
}
async function navigate(path) { await send('Page.navigate', { url: base + path }); await wait(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`); }
async function value(selector, next) {
  await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) throw new Error('Missing field'); const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(next)}); e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true})); })()`);
}
async function click(text) { assert(await evaluate(`(() => {const e=[...document.querySelectorAll('main button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!e||e.disabled)return false;e.click();return true;})()`), 'Enabled button: ' + text); }
async function textIncludes(text) { await wait(`document.querySelector('main')?.textContent.includes(${JSON.stringify(text)})`); }

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let semesters = [
 { id: uuid(1), name: 'Fall 2026', year: 2026, season: 'Fall', startsOn: '2026-08-31', endsOn: '2026-12-16', timeZone: 'America/Chicago', revision: 0 },
 { id: uuid(3), name: 'Spring 2027', year: 2027, season: 'Spring', startsOn: null, endsOn: null, timeZone: 'America/Chicago', revision: 0 },
];
let cycles = [{ id: uuid(2), semester: semesters[0], revision: 0, signupDeadline: '2026-10-31T22:30:00.123Z', observationDeadline: '2026-11-30T23:00:00.000Z', feedbackDeadline: '2026-12-20T23:00:00.000Z', allowedActions: ['update','updateSettings'] }];
const writes = []; let failure;
async function fulfill(event, body, status=200) { await send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')}); }
handlers.set('Fetch.requestPaused',async event => {
 try {
  const url=new URL(event.request.url), path=url.pathname, method=event.request.method;
  if(path.startsWith('/api/auth/')||path==='/api/me'){await send('Fetch.continueRequest',{requestId:event.requestId});return;}
  const list=items=>({items,pageInfo:{hasMore:false,nextCursor:null}});
  if(method==='GET'){
   if(path==='/api/semesters')await fulfill(event,list(semesters));
   else if(path==='/api/evaluation-cycles')await fulfill(event,list(cycles.filter(c=>!url.searchParams.has('semesterId')||c.semester.id===url.searchParams.get('semesterId'))));
   else if(path.startsWith('/api/evaluation-cycles/'))await fulfill(event,cycles.find(c=>path.endsWith(c.id)));
   else await fulfill(event,list([]));
   return;
  }
  const body=JSON.parse(event.request.postData??'{}'); writes.push({path,method,body});
  if(method==='POST'&&path==='/api/semesters'){
   assert.equal(body.year,2028);assert.equal(body.season,'Spring');assert.ok(body.id);assert.ok(body.deadlines);
   const semester={id:body.id,name:'Spring 2028',year:2028,season:'Spring',startsOn:body.startsOn,endsOn:body.endsOn,timeZone:body.timeZone,revision:0};
   const cycle={id:uuid(5),semester,revision:0,...body.deadlines,allowedActions:['updateSettings']};semesters.push(semester);cycles.push(cycle);await fulfill(event,{...semester,cycle},201);
  }else if(method==='PUT'&&path.endsWith('/settings')){
   const cycle=cycles.find(c=>path.includes(c.id));
   assert.equal(body.expectedCycleRevision,cycle.revision);assert.equal(body.expectedSemesterRevision,cycle.semester.revision);
   assert.deepEqual(body.deadlines,{signupDeadline:cycle.signupDeadline,observationDeadline:cycle.observationDeadline,feedbackDeadline:cycle.feedbackDeadline});
   const saved={...cycle,...body.deadlines,revision:cycle.revision+1,semester:{...cycle.semester,...body.semester,revision:cycle.semester.revision+1}};
   cycles=cycles.map(c=>c.id===saved.id?saved:c);semesters=semesters.map(s=>s.id===saved.semester.id?saved.semester:s);await fulfill(event,{cycle:saved,semester:saved.semester});
  }else if(method==='PUT'&&path===`/api/semesters/${uuid(3)}`){
   assert.equal(body.expectedRevision,0);
   const semester={...semesters.find(s=>s.id===uuid(3)),startsOn:body.startsOn,endsOn:body.endsOn,timeZone:body.timeZone,revision:1};
   const cycle={id:uuid(4),semester,revision:0,...body.deadlines,allowedActions:['updateSettings']};semesters=semesters.map(s=>s.id===semester.id?semester:s);cycles.push(cycle);await fulfill(event,{semester,cycle});
  }else if(method==='DELETE'&&path===`/api/semesters/${uuid(1)}`){
   assert.deepEqual(body,{expectedRevision:2,expectedCycleRevision:2});semesters=semesters.filter(s=>s.id!==uuid(1));cycles=cycles.filter(c=>c.semester.id!==uuid(1));await fulfill(event,{deleted:true});
  }else throw Error('Unexpected business mutation '+method+' '+path);
 }catch(error){failure=error;await send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'}).catch(()=>{});}
});
async function field(name,next){await value(`[name="${name}"]`,next);}
async function select(id){await field('semesterId',id);}
async function fill(year) {
 for(const [name,next]of Object.entries({startsOn:`${year}-01-11`,endsOn:`${year}-05-14`,signupDeadline:`${year}-02-01T12:00`,observationDeadline:`${year}-03-01T12:00`,feedbackDeadline:`${year}-06-01T12:00`}))await field(name,next);
}
try{
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 for(const [name,value]of jar)await send('Network.setCookie',{name,value,url:base,httpOnly:true});
 await send('Fetch.enable',{patterns:[{urlPattern:`${base}/api/*`}]});
 await navigate('/ac/semester');await wait(`document.querySelector('[name="semesterId"] option[value="${uuid(1)}"]')`);
 assert.deepEqual(await evaluate(`[...document.querySelector('[name="semesterId"]').options].filter(o=>o.value).map(o=>o.textContent)`),['Spring 2027','Fall 2026']);
 await select(uuid(1));await textIncludes('Save Settings');
 assert.equal(await evaluate(`document.querySelector('[name="signupDeadline"]').value`),'2026-10-31T17:30');
 for(let n=1;n<=2;n++){await click('Save Settings');await textIncludes('Settings saved.');await wait(`!([...document.querySelectorAll('main button')].find(b=>b.textContent==='Save Settings')?.disabled)`);}
 assert.equal(writes.filter(w=>w.path.endsWith('/settings')).length,2);
 await field('startsOn','2026-09-01');await click('Cancel');assert.equal(await evaluate(`document.querySelector('[name="startsOn"]').value`),'2026-08-31');
 await select(uuid(3));await textIncludes('This semester has no evaluation cycle.');await fill(2027);await click('Save and Create Cycle');await textIncludes('Settings saved.');
 await click('New Semester');await field('year','2028');await fill(2028);await click('Create Semester');await textIncludes('Semester and evaluation cycle created.');
 assert.equal(await evaluate(`document.querySelector('[name="semesterId"]').selectedOptions[0].textContent`),'Spring 2028');
 for(const width of [1280,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate(`document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth+1`),true,'No horizontal content overflow at '+width);
 }
 await select(uuid(1));await textIncludes('Save Settings');await click('Delete Semester');await textIncludes('This permanently deletes');assert.equal(writes.filter(w=>w.method==='DELETE').length,0);
 await click('Keep Semester');assert.equal(writes.filter(w=>w.method==='DELETE').length,0);
 await click('Delete Semester');await click('Permanently Delete Semester');await textIncludes('Semester and dependent records deleted.');
 assert.equal(await evaluate(`document.querySelector('[name="semesterId"]').value`),'');
 assert.equal(writes.filter(w=>w.method==='DELETE').length,1);if(failure)throw failure;
 console.log('Passed unified Semester Settings browser workflow, inline no-cycle configuration, exact saves, create/select, Cancel, confirmed delete and responsive overflow checks. All writes intercepted.');
}finally{await send('Fetch.disable').catch(()=>{});socket.close();await fetch(`${debug}/json/close/${target.id}`).catch(()=>{});}
