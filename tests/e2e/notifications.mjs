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
const {jar}=await login('Faculty');
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
    if (message.error) promise?.reject(new Error("Browser protocol request failed.")); else promise?.resolve(message.result);
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
  throw new Error(`Browser condition timed out: ${expression}`);
}
async function navigate(path) { await send("Page.navigate", { url: `${base}${path}` }); await wait(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`); }
async function value(name, next) {
  await evaluate(`(() => { const e = document.querySelector('[name="${name}"]'); const setter = Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(e, ${JSON.stringify(next)}); e.dispatchEvent(new Event(e instanceof HTMLSelectElement ? 'change' : 'input', {bubbles:true})); })()`);
}
async function click(text) {
  await wait(`[...document.querySelectorAll('button')].some(e=>e.textContent===${JSON.stringify(text)}&&!e.disabled)`);
  await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)}).click()`);
}

const observationId='11111111-1111-4111-8111-111111111111';
const titles=['Observer invitation received','Observer accepted','Observation reminder','Form submitted','Evaluation cycle opened'];
const messages=['Professor A invited you to observe CS 4485.','Professor B accepted your observation request.','Your scheduled observation is approaching.','The observation form has been submitted.','Fall 2026 evaluation signup is available. '+('This message includes additional guidance and important details. '.repeat(30))+'Full message ends here.'];
const initial=titles.map((title,i)=>({id:'n'+i,type:'workflow',title,message:messages[i],createdAt:i===4?'2026-10-28T13:00:00Z':'2026-10-28T10:00:00Z',readAt:null,target:i===4?null:{kind:'observation',id:observationId}}));
let records=structuredClone(initial),mode='normal',writes=[],fixtureFailure;
const unread=()=>records.filter(n=>n.readAt===null).length;
handlers.set('Fetch.requestPaused',async event=>{
 try {
  const url=new URL(event.request.url),path=url.pathname,method=event.request.method;let status=200,body;
  if(mode==='unavailable'){status=404;body={error:{code:'UNAVAILABLE'}};}
  else if(mode==='denied'){status=403;body={error:{code:'FORBIDDEN'}};}
  else if(mode==='signedOut'){status=401;body={error:{code:'UNAUTHENTICATED'}};}
  else if(path.endsWith('/unread-count'))body={unreadCount:unread(),asOf:'2026-10-28T12:00:00Z'};
  else if(method==='GET'){
   const items=mode==='empty'?[]:records.filter(n=>url.searchParams.get('read')!=='unread'||n.readAt===null);
   const start=url.searchParams.has('cursor')?Number(url.searchParams.get('cursor')):0;
   const next=start+3<items.length?String(start+3):null;
   body={items:items.slice(start,start+3),pageInfo:{hasMore:next!==null,nextCursor:next},unreadCount:mode==='empty'?0:unread(),latestCursor:'latest'};
  } else if(method==='PATCH'){
   const input=JSON.parse(event.request.postData);assert.equal(typeof input.read,'boolean');writes.push({method,input});
   const item=records.find(n=>n.id===decodeURIComponent(path.split('/').at(-1)));assert.ok(item);item.readAt=input.read?'2026-10-28T12:00:00Z':null;body=item;
  } else if(method==='POST'&&path.endsWith('/mark-all-read')){
   assert.deepEqual(JSON.parse(event.request.postData),{});writes.push({method});let updatedCount=0;
   for(const item of records)if(item.readAt===null&&item.createdAt<='2026-10-28T12:00:00Z'){item.readAt='2026-10-28T12:00:00Z';updatedCount++;}
   body={updatedCount,cutoff:'2026-10-28T12:00:00Z',unreadCount:unread()};
  } else throw new Error('Unexpected notification request');
  await send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
 }catch(error){fixtureFailure=error;await send('Fetch.failRequest',{requestId:event.requestId,errorReason:'Failed'});}
});
try{
 await send('Network.enable');await send('Page.enable');
 await send('Network.setCookies',{cookies:[...jar].map(([name,value])=>({name,value,url:base}))});
 await send('Emulation.setDeviceMetricsOverride',{width:1480,height:1160,deviceScaleFactor:1,mobile:false});
 await send('Fetch.enable',{patterns:[{urlPattern:base+'/api/notifications*'}]});

 await navigate('/notifications');await wait('document.querySelectorAll("tbody tr").length===3');
 assert.equal(await evaluate('document.querySelector("h1").textContent'),'Notifications');
 await wait(`[...document.querySelectorAll('a')].some(e=>e.getAttribute('aria-label')==='Notifications (5 unread)')`);
 await click('Load more');await wait('document.querySelectorAll("tbody tr").length===5');
 assert.deepEqual(await evaluate('[...document.querySelectorAll("th")].map(x=>x.textContent)'),['','Notification','Details','Action']);
 const geometry=await evaluate('(()=>{const s=document.querySelector("select").getBoundingClientRect(),t=document.querySelector("table").getBoundingClientRect();return {selectWidth:s.width,tableWidth:t.width,overflow:document.documentElement.scrollWidth>innerWidth}})()');
 assert.equal(geometry.selectWidth,480);assert.equal(geometry.tableWidth,1094);assert.equal(geometry.overflow,false);
 assert.equal(await evaluate(`(()=>{const p=document.querySelectorAll('tbody tr')[4].querySelector('td:nth-last-child(2) p');return p.scrollHeight>p.clientHeight&&getComputedStyle(p).webkitLineClamp==='2';})()`),true);
 await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>writeFileSync(join(tmpdir(),'assessment-notifications-desktop.png'),Buffer.from(r.data,'base64')));
 await evaluate(`document.querySelectorAll('tbody input[type=checkbox]')[0].click()`);
 assert.equal(await evaluate(`document.querySelector('thead input').indeterminate`),true);
 await evaluate(`document.querySelectorAll('tbody input[type=checkbox]')[1].click()`);
 await click('Mark selected as read');await wait(`document.querySelector('main').textContent.includes('2 notifications marked as read.')`);
 assert.equal(writes.filter(x=>x.method==='PATCH').length,2);
 await wait(`![...document.querySelectorAll('button')].some(e=>e.getAttribute('aria-busy')==='true')`);
 assert.equal(await evaluate(`[...document.querySelectorAll('tbody input')].filter(e=>e.checked).length`),0);
 records=structuredClone(initial);writes=[];await click('Refresh');await wait('document.querySelectorAll("tbody tr").length===3');
 await evaluate(`const view=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')?.startsWith('View:'));view.focus();view.click();`);
 await wait(`document.querySelector('dialog').open&&document.querySelector('dialog [role=status]')?.textContent==='Read'`);
 assert.equal(await evaluate('location.pathname'),'/notifications');
 assert.equal(await evaluate(`document.querySelector('dialog a').getAttribute('href')`),'/observations/details?observationId='+observationId);
 await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>writeFileSync(join(tmpdir(),'assessment-notification-detail-desktop.png'),Buffer.from(r.data,'base64')));
 await click('Close');await wait(`!document.querySelector('dialog').open&&document.querySelector('dialog').textContent.trim()===''`);
 await wait(`![...document.querySelectorAll('button')].some(e=>e.getAttribute('aria-busy')==='true')`);
 await value('read','unread');await wait(`document.querySelector('select').value==='unread'&&document.querySelectorAll('tbody tr').length===3&&document.querySelector('tbody tr').textContent.includes('Observer accepted')`);
 await evaluate(`const next=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')?.startsWith('View:'));next.focus();next.click();`);
 await wait(`document.querySelector('dialog').open&&document.querySelector('dialog [role=status]')?.textContent==='Read'`);
 assert.equal(await evaluate(`document.querySelector('dialog').textContent.includes('Professor B accepted')`),true);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await wait(`!document.querySelector('dialog').open&&document.querySelector('dialog').textContent.trim()===''`);
 await wait("document.activeElement.id==='notifications-heading'");
 assert.equal(await evaluate('document.activeElement.id'),'notifications-heading');
 await wait(`![...document.querySelectorAll('button')].some(e=>e.getAttribute('aria-busy')==='true')`);
 await value('read','all');await wait('document.querySelectorAll("tbody tr").length===3');
 await click('Load more');await wait('document.querySelectorAll("tbody tr").length===5');
 await evaluate(`[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='View: Evaluation cycle opened').click()`);
 await wait(`document.querySelector('dialog').open&&document.querySelector('dialog [role=status]')?.textContent==='Read'`);
 assert.equal(await evaluate(`document.querySelector('dialog').textContent.includes('Full message ends here.')`),true);
 assert.equal(await evaluate(`document.querySelector('dialog a')===null`),true);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 assert.equal(await evaluate(`(()=>{const d=document.querySelector('dialog').getBoundingClientRect();return d.width<=innerWidth-32&&d.height<=innerHeight-32;})()`),true);
 assert.equal(await evaluate(`(()=>{const b=[...document.querySelectorAll('dialog button')].find(e=>e.textContent==='Close').getBoundingClientRect();return b.bottom<=innerHeight&&b.top>=0;})()`),true);
 await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>writeFileSync(join(tmpdir(),'assessment-notification-detail-mobile.png'),Buffer.from(r.data,'base64')));
 await click('Close');await wait(`!document.querySelector('dialog').open&&document.querySelector('dialog').textContent.trim()===''`);
 await wait(`![...document.querySelectorAll('button')].some(e=>e.getAttribute('aria-busy')==='true')`);
 records=structuredClone(initial);writes=[];await click('Refresh');await wait('document.querySelectorAll("tbody tr").length===3');
 await click('Mark All Read');await wait(`document.querySelector('main').textContent.includes('4 notifications marked as read.')`);
 await wait(`[...document.querySelectorAll('a')].some(e=>e.getAttribute('aria-label')==='Notifications (1 unread)')`);
 await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true}).then(r=>writeFileSync(join(tmpdir(),'assessment-notifications-mobile.png'),Buffer.from(r.data,'base64')));
 mode='empty';await click('Refresh');await wait('document.querySelector("main").textContent.includes("No notifications yet.")');
 mode='unavailable';await click('Refresh');await wait('document.querySelector("main").textContent.includes("Notifications are currently unavailable.")');
 assert.equal(await evaluate('document.querySelector("main").textContent.includes("Professor A")'),false);
 mode='denied';await click('Refresh');await wait('document.querySelector("main").textContent.includes("Notification access is denied.")');
 mode='signedOut';await click('Refresh');await wait(`[...document.querySelectorAll('main a')].some(e=>e.getAttribute('href')==='/login')`);
 if(fixtureFailure)throw fixtureFailure;
 console.log('Passed Notifications browser checks: desktop/mobile layout, loaded-row selection, selective read updates, message truncation, auto-read dialog, unread-row removal, Escape/focus restoration, full unmapped message, optional destination, cutoff-safe mark all, synchronized bell and failure states. Screenshots saved to OS temp. All notification APIs were intercepted; no business records changed.');
}finally{await send('Fetch.disable');socket.close();await fetch(debug+'/json/close/'+target.id);}
