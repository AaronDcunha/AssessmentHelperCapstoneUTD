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
let semesters = [{ id: uuid(1), name: 'Fall 2026', startsOn: '2026-08-31', endsOn: '2026-12-16', timeZone: 'America/Chicago', revision: 0 }];
let cycle = { id: uuid(2), semester: semesters[0], revision: 0, signupDeadline: '2026-10-31T22:30:00.000Z', observationDeadline: '2026-11-30T23:00:00.000Z', feedbackDeadline: '2026-12-20T23:00:00.000Z', allowedActions: ['update','updateSettings'] };
const writes = []; let failure;
async function fulfill(event, body, status=200) { await send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')}); }
handlers.set('Fetch.requestPaused',async event => {
 try {
  const path=new URL(event.request.url).pathname, method=event.request.method;
  if(path.startsWith('/api/auth/')||path==='/api/me'){await send('Fetch.continueRequest',{requestId:event.requestId});return;}
  if(method==='GET'){
   const list=items=>({items,pageInfo:{hasMore:false,nextCursor:null}});
   if(path==='/api/semesters')await fulfill(event,list(semesters));
   else if(path==='/api/evaluation-cycles')await fulfill(event,list(cycle?[cycle]:[]));
   else if(path===`/api/evaluation-cycles/${uuid(2)}`)await fulfill(event,cycle);
   else await fulfill(event,list([]));
   return;
  }
  const body=JSON.parse(event.request.postData??'{}'); writes.push({path,method,body});
  if(method==='POST'&&path==='/api/semesters'){
   assert.equal(body.year,2027);assert.equal(body.season,'Spring');
   const semester={id:uuid(3),name:'Spring 2027',startsOn:body.startsOn,endsOn:body.endsOn,timeZone:body.timeZone,revision:0};semesters.push(semester);await fulfill(event,semester,201);
  }else if(method==='PUT'&&path.endsWith('/settings')){
   assert.equal(body.expectedCycleRevision,cycle.revision);assert.equal(body.expectedSemesterRevision,cycle.semester.revision);
   assert.deepEqual(body.deadlines,{signupDeadline:cycle.signupDeadline,observationDeadline:cycle.observationDeadline,feedbackDeadline:cycle.feedbackDeadline});
   cycle={...cycle,...body.deadlines,revision:cycle.revision+1,semester:{...cycle.semester,...body.semester,revision:cycle.semester.revision+1}};semesters[0]=cycle.semester;await fulfill(event,{cycle,semester:cycle.semester});
  }else if(method==='DELETE'&&path===`/api/semesters/${uuid(1)}`){
   assert.deepEqual(body,{expectedRevision:2,expectedCycleRevision:2});semesters=semesters.filter(s=>s.id!==uuid(1));cycle=null;await fulfill(event,{deleted:true});
  }else throw Error('Unexpected business mutation '+method+' '+path);
 }catch(error){failure=error;await send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'}).catch(()=>{});}
});
try{
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 for(const [name,value]of jar)await send('Network.setCookie',{name,value,url:base,httpOnly:true});
 await send('Fetch.enable',{patterns:[{urlPattern:`${base}/api/*`}]});
 await navigate('/ac/semester');await textIncludes('Save Settings');await textIncludes('Delete Fall 2026');
 assert.equal(await evaluate(`document.querySelector('[name="signupDeadline"]').value`),'2026-10-31T17:30');
 await click('Save Settings');await textIncludes('Settings saved.');await wait(`!([...document.querySelectorAll('main button')].find(b=>b.textContent==='Save Settings')?.disabled)`);
 await click('Save Settings');await wait(`document.querySelector('main').textContent.includes('Settings saved.')`);await wait(`!([...document.querySelectorAll('main button')].find(b=>b.textContent==='Save Settings')?.disabled)`);
 assert.equal(writes.filter(w=>w.method==='PUT').length,2);
 await click('New Semester');
 for(const [name,next]of Object.entries({year:'2027',season:'Spring',startsOn:'2027-01-11',endsOn:'2027-05-14'}))await value(`[name="${name}"]`,next);
 await click('Create Semester');await textIncludes('Semester created.');await textIncludes('Delete Spring 2027');
 for(const width of [1280,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate(`document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth+1`),true,'No horizontal content overflow at '+width);
 }
 await click('Delete Fall 2026');await textIncludes('This permanently deletes');assert.equal(writes.filter(w=>w.method==='DELETE').length,0);
 await click('Cancel');assert.equal(writes.filter(w=>w.method==='DELETE').length,0);
 await click('Delete Fall 2026');await click('Permanently Delete Semester');await textIncludes('Semester and its evaluation cycle deleted.');
 assert.equal(writes.filter(w=>w.method==='DELETE').length,1);if(failure)throw failure;
 console.log('Passed browser Semester Settings: exact zone input, two revision-aware saves, New Semester, desktop/mobile overflow, delete cancel/confirmation and cycle removal. All business writes intercepted.');
}finally{await send('Fetch.disable').catch(()=>{});socket.close();await fetch(`${debug}/json/close/${target.id}`).catch(()=>{});}
