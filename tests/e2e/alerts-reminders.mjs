// Dependency-free browser verification. Requires a built/running local app and an isolated
// headless Chrome/Edge instance with --remote-debugging-port=9223. Seeded login is read
// from the ignored credential file; secrets/cookies never enter output. Business API
// requests are intercepted in this browser target only, including every mutation.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
assert.equal(new URL(base).hostname, "localhost", "Use an isolated localhost test server.");
const debug = process.env.TEST_CDP_URL ?? "http://127.0.0.1:9223";
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
const anonymous=await fetch(base+'/notifications',{redirect:'manual'});assert.equal(anonymous.status,307);
const {jar}=await login('Admin');
const target = await (await fetch(`${debug}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
const handlers = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const promise = pending.get(message.id); pending.delete(message.id);
    if (message.error) promise?.reject(new Error("Browser protocol request failed: "+message.error.message)); else promise?.resolve(message.result);
  } else handlers.get(message.method)?.(message.params);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })); });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!result.exceptionDetails, "Browser evaluation must succeed.");
  return result.result?.value;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(50); }
  throw new Error(`Browser condition timed out: ${expression}; fixture=${fixtureFailure?.message}; state=${JSON.stringify(await evaluate("({path:location.pathname,text:document.querySelector('main')?.innerText.slice(0,1600)})"))}`);
}
async function navigate(path) { await send("Page.navigate", { url: `${base}${path}` }); await wait(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`); }
async function click(text) {
  await wait(`[...document.querySelectorAll('button')].some(e=>e.textContent===${JSON.stringify(text)}&&!e.disabled)`);
  await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)}).click()`);
}


const cycleId='11111111-1111-4111-8111-111111111111',observationId='22222222-2222-4222-8222-222222222222',alertId='33333333-3333-4333-8333-333333333333';
const cycle={id:cycleId,semester:{id:cycleId,name:'Fall 2026'},signupDeadline:null,observationDeadline:null,feedbackDeadline:null};
let alert={id:alertId,observationId,cycleId,type:'ALERT',status:'pending',reasonCode:'OTHER',reason:'Need observer assistance',details:'Full faculty explanation.',createdAt:'2026-10-28T12:00:00Z',revision:0,resolutionNote:null,allowedActions:['acknowledge'],context:{observee:{name:'Test Faculty'},observer:null,section:{course:'CS 4485',sectionNumber:'001',semester:{name:'Fall 2026'}},observationStatus:'PENDING',candidates:[{id:'candidate',name:'Candidate One',status:'PENDING'}]}};
const observation={id:observationId,observee:{id:'faculty',name:'Test Faculty'},observer:null,status:'PENDING',assessmentStatus:'NOT_STARTED',section:{course:{code:'CS 4485'}},scheduledMeeting:null};
let fixtureFailure,reminders=[];
handlers.set('Fetch.requestPaused',async event=>{
 try{
  const path=new URL(event.request.url).pathname,method=event.request.method;let body,status=200;
  if(path==='/api/evaluation-cycles')body={items:[cycle],pageInfo:{hasMore:false,nextCursor:null}};
  else if(path.endsWith('/notifications')&&method==='POST'){const input=JSON.parse(event.request.postData);assert.deepEqual(input.channels,['inApp','email']);assert.ok(event.request.headers['Idempotency-Key']??event.request.headers['idempotency-key']);reminders.push(input);body={recipientCount:2,notificationCount:2,emailQueuedCount:2,status:'completed'};}
  else if(path==='/api/notifications/unread-count')body={unreadCount:0,asOf:'2026-10-28T12:00:00Z'};
  else if(path.endsWith('/observations')&&path.includes('/evaluation-cycles/'))body={items:[observation],pageInfo:{hasMore:false,nextCursor:null}};
  else if(path.endsWith('/alerts')&&path.includes('/evaluation-cycles/'))body={items:[alert],pageInfo:{hasMore:false,nextCursor:null}};
  else if(path==='/api/alerts/'+alertId&&method==='PATCH'){throw new Error('Message lifecycle writes must not occur');}else if(path==='/api/alerts/'+alertId)body=alert;
  else if(path==='/api/observations/'+observationId)body={observation,proposedMeetings:[],progress:[],pendingAlert:{id:alertId}};
  else if(path.endsWith('/assessment'))body={observationId,assessment:null,allowedActions:[]};
  else throw new Error('Unexpected fixture route '+path);
  await send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
 }catch(error){fixtureFailure=error;await send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'}).catch(()=>{});}
});
try{
 await send('Network.enable');await send('Page.enable');await send('Network.setCookies',{cookies:[...jar].map(([name,value])=>({name,value,url:base}))});
 await send('Emulation.setDeviceMetricsOverride',{width:1480,height:1160,deviceScaleFactor:1,mobile:false});
 await send('Fetch.enable',{patterns:['evaluation-cycles','observations','alerts','notifications'].map(name=>({urlPattern:base+'/api/'+name+'*'}))});
 await navigate('/ac/observations');await wait(`document.querySelector('main').textContent.includes('Need observer assistance')`);
 await click('Send reminder');
 await evaluate(`(()=>{const e=document.querySelector('main textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Please review your tasks.');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await click('Send to matching faculty');await wait(`document.querySelector('main').textContent.includes('Reminder delivered in-app to 2 faculty members.')`);assert.equal(reminders.length,1);await wait(`document.querySelector('main').textContent.includes('2 emails queued.')`);
 await evaluate(`[...document.querySelectorAll('main a')].find(e=>e.textContent==='View message').click()`);
 await wait(`location.pathname==='/ac/observations/${observationId}'&&document.querySelector('main').textContent.includes('Full faculty explanation.')`);
 assert.equal(await evaluate(`document.querySelector('main').textContent.includes('Candidate One')`),true);
 assert.equal(await evaluate("[...document.querySelectorAll('button')].some(e=>/Acknowledge alert|Resolve alert/.test(e.textContent))"),false);
 await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>writeFileSync(join(tmpdir(),'assessment-alert-context-desktop.png'),Buffer.from(r.data,'base64')));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 if(fixtureFailure)throw fixtureFailure;
 console.log('Passed AC browser integration: cycle alert list, correct observation/alert context, current candidates, read-only message context without acknowledgement/resolution controls, in-app/email reminder control with idempotency key, and mobile overflow. Every business API was intercepted; no real reminders or emails were sent.');
}finally{await send('Fetch.disable');socket.close();await fetch(debug+'/json/close/'+target.id);}
