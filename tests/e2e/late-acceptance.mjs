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
const {jar,request:liveRequest}=await login('Admin');
const liveRead=await liveRequest('/api/evaluation-cycles/current/expired-acceptance-requests');
console.log('Live current-cycle GET status:',liveRead.status);
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
async function navigate(path) { await send("Page.navigate", { url: `${base}${path}` }); await wait(`location.pathname + location.search === ${JSON.stringify(path)} && document.readyState === 'complete'`); }
async function click(text) {
  await wait(`[...document.querySelectorAll('button')].some(e=>e.textContent===${JSON.stringify(text)}&&!e.disabled)`);
  await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)}).click()`);
}

const root='/ac/late-acceptance-requests';
const requestId='11111111-1111-4111-8111-111111111111';
const cycle={id:'22222222-2222-4222-8222-222222222222',name:'Browser fixture semester',timeZone:'America/Chicago'};
const original={id:requestId,status:'PENDING',persistedStatus:'PENDING',displayStatus:'PENDING',requestedAt:'2026-11-03T16:00:00Z',decidedAt:null,reason:'Saved reason <script>not executable</script>',actionable:true,reasonCode:null,actionReason:null,requester:{id:'observer',name:'Fixture Observer'},observee:{id:'observee',name:'Fixture Observee'},course:'TEST 4000',section:'007',originalInvitationExpiresAt:'2026-11-02T16:00:00Z',observationDeadline:'2026-11-30T23:59:00Z',timeZone:'America/Chicago',proposedMeetings:[{id:'meeting',sectionId:'section',date:'2026-11-09',startsAt:'2026-11-09T16:00:00Z',endsAt:'2026-11-09T17:00:00Z',timeZone:'America/Chicago',location:'Fixture room'}]};
let record={...original},fixtureFailure,mode='normal',decisions=[],readQueries=[],releaseRead,releaseDecision;
const summary={pending:2,approved:1,notActionable:1,total:4};
handlers.set('Fetch.requestPaused',async event=>{
 try {
  const url=new URL(event.request.url),method=event.request.method; let body,status=200;
  if(url.pathname==='/api/evaluation-cycles')body={items:[],pageInfo:{hasMore:false,nextCursor:null}};
  else if(url.pathname==='/api/notifications/unread-count')body={unreadCount:0};
  else if(url.pathname.endsWith('/expired-acceptance-requests')){
    readQueries.push(url.search);
    const snapshot={...record};
    if(mode==='loading')await new Promise(resolve=>{releaseRead=resolve;});
    if(mode==='error'){status=503;body={error:'Unavailable'};}
    else {const items=mode==='empty'||mode==='filtered'?[]:[snapshot];body={cycle:mode==='noCycle'?null:cycle,items,summary:mode==='empty'?{pending:0,approved:0,notActionable:0,total:0}:summary,pageInfo:{hasMore:false,nextCursor:null}};}
  } else if(url.pathname==='/api/expired-acceptance-requests/'+requestId&&method==='PATCH'){
    const input=JSON.parse(event.request.postData);assert.deepEqual(Object.keys(input),['decision']);decisions.push(input);
    if(mode==='submitting')await new Promise(resolve=>{releaseDecision=resolve;});
    if(mode==='conflict') {record={...record,actionable:false,displayStatus:'OBSERVER_CONFIRMED',reasonCode:'OBSERVER_CONFIRMED',actionReason:'An observer has already been confirmed.'};status=409;body={error:'This observation changed.'};}
    else {record={...record,status:input.decision.toUpperCase(),displayStatus:input.decision.toUpperCase(),actionable:false};body={request:{id:requestId,status:record.status}};}
  } else throw Error('Unexpected browser fixture API '+url.pathname);
  await send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
 }catch(error){fixtureFailure=error;await send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'}).catch(()=>{});}
});
const main=expression=>`document.querySelector('main')?.textContent.includes(${JSON.stringify(expression)})`;
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});writeFileSync(join(tmpdir(),'late-acceptance-'+name+'.png'),Buffer.from(r.data,'base64'));}
try {
 await send('Network.enable');await send('Page.enable');await send('Network.setCookies',{cookies:[...jar].map(([name,value])=>({name,value,url:base}))});
 await send('Emulation.setDeviceMetricsOverride',{width:1480,height:1160,deviceScaleFactor:1,mobile:false});
 await send('Fetch.enable',{patterns:['evaluation-cycles','expired-acceptance-requests','notifications'].map(name=>({urlPattern:base+'/api/'+name+'*'}))});
 mode='loading';await navigate(root);await wait(`!!document.querySelector('[aria-label="Loading late acceptance requests"]')`);
 assert.equal(decisions.length,0);mode='normal';releaseRead();await wait(main('Fixture Observer'));
 assert.equal(await evaluate(main('Current semester · Browser fixture semester')),true);
 assert.equal(await evaluate(main('2 pending requests · 1 approved · 1 no longer actionable')),true);
 await screenshot('list');
 await evaluate(`[...document.querySelectorAll('main a')].find(a=>a.textContent==='Review →').click()`);
 await wait(main('Review late acceptance request'));await wait(main('Saved reason <script>not executable</script>'));
 assert.equal(await evaluate("!!document.querySelector('main script')"),false);
 await screenshot('pending');
 await evaluate(`[...document.querySelectorAll('main a')].find(a=>a.textContent==='Keep pending').click()`);await wait(main('Fixture Observer'));assert.equal(decisions.length,0);
 await navigate(root+'/'+requestId);await wait(main('Review late acceptance request'));
 mode='submitting';await click('Approve & reopen');await wait("[...document.querySelectorAll('main button')].filter(e=>e.disabled).length===2");
 mode='normal';releaseDecision();await wait(main('Acceptance window reopened'));assert.equal(decisions.length,1);await wait(`document.activeElement?.textContent==='Acceptance window reopened'`);await screenshot('approved');
 await evaluate(`[...document.querySelectorAll('main a')].find(a=>a.textContent==='Back to requests').click()`);await wait(main('Fixture Observer'));assert.ok(readQueries.length>=3);
 record={...original};await navigate(root+'/'+requestId);await wait(main('Review late acceptance request'));await click('Reject request');await wait(main('Late acceptance request rejected'));await screenshot('rejected');
 record={...original};await navigate(root+'/'+requestId);await wait(main('Review late acceptance request'));mode='conflict';await click('Approve & reopen');await wait(main('An observer has already been confirmed.'));
 assert.equal(await evaluate("[...document.querySelectorAll('main button')].some(e=>e.textContent==='Approve & reopen')"),false);await screenshot('stale');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await screenshot('mobile');
 mode='empty';await navigate(root);await wait(main('No late acceptance requests for this cycle'));
 mode='filtered';await navigate(root+'?search=absent&status=approved');await wait(main('No requests match these filters.'));
 mode='error';await navigate(root+'?search=retained&status=approved');await wait(main('Late acceptance requests are unavailable. Please retry.'));
 mode='normal';await click('Retry');await wait(main('Fixture Observer'));assert.ok(readQueries.at(-1).includes('search=retained')&&readQueries.at(-1).includes('status=approved'));
 mode='noCycle';await navigate(root);await wait(main('No current configured evaluation cycle'));
 mode='normal';record={...original};await navigate(root);await wait(main('Fixture Observer'));
 const input=value=>evaluate(`(()=>{const input=document.querySelector('main input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 mode='loading';releaseRead=null;await input('slow');await wait(`!!document.querySelector('[aria-label="Loading late acceptance requests"]')`);
 while(!releaseRead)await pause(20);
 mode='normal';record={...original,requester:{...original.requester,name:'Latest filtered observer'}};await input('fast');await wait(main('Latest filtered observer'));
 releaseRead();await pause(150);assert.equal(await evaluate(main('Latest filtered observer')),true);assert.equal(await evaluate(main('Fixture Observer')),false);
 if(fixtureFailure)throw fixtureFailure;
 console.log('PASS: actual production app in Chrome with browser-only fixtures: list, skeleton, pending/approved/rejected/stale views, conflict reload, disabled decision controls, safe reason text, empty/no matches/error/retry with filters, no-cycle state, and 390px overflow. All business API writes intercepted. Screenshots in OS temp: late-acceptance-*.png.');
}finally{await send('Fetch.disable');socket.close();await fetch(debug+'/json/close/'+target.id);}
