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
const {jar}=await login('AC');
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
  while (Date.now() < deadline) { if (await evaluate(`!!(${expression})`)) return; await pause(50); }
  throw new Error(`Browser condition timed out: ${expression}; fixture=${fixtureFailure?.message}; state=${JSON.stringify(await evaluate("({path:location.pathname,text:document.querySelector('main')?.innerText.slice(0,1600)})"))}`);
}
async function navigate(path) { await send("Page.navigate", { url: `${base}${path}` }); await wait(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`); }
async function click(text) {
  await wait(`[...document.querySelectorAll('button')].some(e=>e.textContent===${JSON.stringify(text)}&&!e.disabled)`);
  await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)}).click()`);
}

const uuid = n => `74000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cycles = [1, 2].map(n => ({ id: uuid(n), semester: { id: uuid(n + 2), name: `Review cycle ${n}` } }));
const observationId = uuid(10), alertId = uuid(20), secondAlertId = uuid(21);
const savedDetails = '<script>window.alertExecuted=true</script>\nSecond saved line\n' + 'LongMessage'.repeat(250);
const message = (id, cycleId = cycles[0].id) => ({ id, observationId, cycleId, type: 'ALERT', reasonCode: 'OTHER', reason: 'Saved reason ' + id, details: id === alertId ? savedDetails : 'Separate second message', createdBy: { id: uuid(30), name: 'Saved Creator' }, createdAt: '2026-10-29T12:00:00Z', allowedActions: [], context: { observee: { name: cycleId === cycles[0].id ? 'Faculty Cycle A' : 'Faculty Cycle B' }, observer: { name: 'Saved Observer' }, section: { course: 'CS 4485', sectionNumber: '001', semester: { name: 'Saved semester' } }, observationStatus: 'SCHEDULED', candidates: [{ id: uuid(31), name: 'Saved Candidate', status: 'INVITED' }] } });
const nonAlerts = ['overdue', 'unmatched', 'incomplete'].map((issue, i) => ({ id: uuid(40 + i), faculty: { id: uuid(30), name: 'Faculty Cycle A' }, issue, observationId, observationStatus: 'PENDING' }));
const duplicate = { ...nonAlerts[0], id: uuid(50), issue: 'alert', alertId, observationStatus: 'PENDING' };
let fixtureFailure, mode = 'normal', detailMode = 'normal', holdA = false, holdInitialAlert = true, holdDetail = true, observationFailure = false;
let listFailureStatus = 500;
const held = [], reads = [], mutations = [];
const list = (items, nextCursor = null) => ({ items, pageInfo: { hasMore: !!nextCursor, nextCursor } });
async function fulfill(event, body, status = 200) {
  await send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
}
handlers.set('Fetch.requestPaused', async event => {
  try {
    const url = new URL(event.request.url), path = url.pathname;
    if (event.request.method !== 'GET') { mutations.push(path); throw new Error('Business mutation blocked'); }
    reads.push(path + url.search);
    let body, status = 200;
    if (path === '/api/evaluation-cycles') body = list(cycles);
    else if (path === '/api/notifications/unread-count') body = { unreadCount: 0 };
    else if (path.includes('/api/evaluation-cycles/')) {
      const cycleId = path.split('/')[3], resource = path.split('/')[4];
      assert(cycles.some(c => c.id === cycleId));
      if (resource === 'reports') body = { cycleId, summary: { facultyDue: 3, overdue: 1, unmatched: 1, incomplete: 1 }, byHiringLevel: [] };
      else {
        assert(['alerts', 'attention'].includes(resource));
        if (mode === resource + '-network') { await send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'InternetDisconnected' }); return; }
        if (mode === 'both-error' || mode === resource + '-error') { status = listFailureStatus; body = { error: { code: 'FIXTURE', message: status < 500 ? 'Controlled read failure.' : 'PRIVATE_SERVER_EXCEPTION' } }; }
        else if (mode === 'empty') body = list([]);
        else if (resource === 'attention') body = list(cycleId === cycles[0].id ? [...nonAlerts, duplicate] : []);
        else if (cycleId === cycles[0].id) body = url.searchParams.has('cursor') ? list([message(secondAlertId)]) : list([message(alertId)], alertId);
        else body = list([message(uuid(22), cycleId)]);
        if (cycleId === cycles[0].id && (holdA || (holdInitialAlert && resource === 'alerts'))) { held.push({ event, body, status }); return; }
      }
    } else if (path.startsWith('/api/alerts/')) {
      const requestedId = path.split('/').at(-1);
      if (detailMode === 'network') { await send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'InternetDisconnected' }); return; }
      if (/^error/.test(detailMode)) { status = Number(detailMode.slice(5)); body = { error: { message: 'PRIVATE_SERVER_EXCEPTION' } }; }
      else if (detailMode === 'wrong-alert') body = message(secondAlertId);
      else if (detailMode === 'wrong-observation') body = { ...message(requestedId), observationId: uuid(99) };
      else body = message(requestedId);
      if (holdDetail) { held.push({ event, body, status }); return; }
    } else if (path === '/api/observations/' + observationId) {
      if (observationFailure) { status = 500; body = { error: { message: 'PRIVATE_SERVER_EXCEPTION' } }; }
      else body = { observation: { id: observationId, observee: { name: 'Faculty Cycle A' }, observer: { name: 'Saved Observer' }, status: 'SCHEDULED', assessmentStatus: 'NOT_STARTED' }, proposedMeetings: [], progress: [], pendingAlert: { id: secondAlertId } };
    }
    else if (path.endsWith('/assessment')) body = { observationId, assessment: null, allowedActions: [] };
    else throw new Error('Unexpected fixture route ' + path);
    await fulfill(event, body, status);
  } catch (error) { fixtureFailure = error; await send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Failed' }).catch(() => {}); }
});

async function selectCycle(id) {
  await evaluate(`(()=>{const e=document.querySelector('[name="cycleId"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(id)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}
async function dashboard(nextMode = 'normal') {
  mode = nextMode; await navigate('/ac');
  await wait(`document.querySelector('[name="cycleId"]')?.options.length===3`);
  await selectCycle(cycles[0].id);
}
async function text(next) { await wait(`document.querySelector('main')?.textContent.includes(${JSON.stringify(next)})`); }
async function rowCount(count) { await wait(`document.querySelectorAll('main tbody tr').length===${count}`); }
async function releaseHeld() {
  const requests = held.splice(0);
  for (const { event, body, status } of requests) await fulfill(event, body, status);
}
async function screenshot(name) {
  const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const path = join(tmpdir(), `ac-dashboard-alerts-${name}.png`);
  writeFileSync(path, Buffer.from(result.data, 'base64')); console.log('Screenshot: ' + path);
}
const detailPath = `/ac/observations/${observationId}?alertId=${alertId}`;
try {
  await send('Network.enable'); await send('Page.enable');
  await send('Network.setCookies', { cookies: [...jar].map(([name, value]) => ({ name, value, url: base })) });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Fetch.enable', { patterns: ['evaluation-cycles', 'observations', 'alerts', 'notifications'].map(name => ({ urlPattern: base + '/api/' + name + '*' })) });
  await navigate('/ac'); await text('Select an evaluation cycle to view items needing attention.');
  await wait(`document.querySelector('[name="cycleId"]')?.options.length===3`);
  assert(!reads.some(path => /\/evaluation-cycles\/[^/]+\//.test(path)), 'No cycle-specific requests before selection');
  await selectCycle(cycles[0].id); await text('Loading faculty alerts'); await rowCount(4);
  holdInitialAlert = false; await releaseHeld(); await rowCount(5);
  assert(reads.includes(`/api/evaluation-cycles/${cycles[0].id}/alerts?cursor=${alertId}`));
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('main tbody tr')].map(e=>e.children[1].textContent)`), ['Overdue', 'Unmatched', 'Incomplete', 'Alert', 'Alert']);
  assert.equal(await evaluate(`[...document.querySelectorAll('main tbody tr')].filter(e=>e.children[1].textContent==='Alert').every(e=>e.children[2].textContent==='SCHEDULED')`), true);
  const destinations = await evaluate(`[...document.querySelectorAll('main tbody a')].map(e=>e.getAttribute('href'))`);
  assert(destinations.includes(detailPath)); assert(destinations.includes(`/ac/observations/${observationId}?alertId=${secondAlertId}`));
  await screenshot('desktop');
  // Invalidate completed data immediately, then resolve old requests after the new cycle.
  await selectCycle(cycles[1].id); await text('Faculty Cycle B');
  holdA = true; await selectCycle(cycles[0].id); await text('Loading faculty alerts');
  assert.equal(await evaluate(`document.querySelector('main tbody').textContent.includes('Faculty Cycle B')`), false);
  await wait(`document.querySelector('main tbody tr')===null`);
  const heldDeadline = Date.now() + 10000;
  while (held.length < 2 && Date.now() < heldDeadline) await pause(25);
  assert.equal(held.length, 2, 'Both superseded cycle requests intercepted');
  await selectCycle(cycles[1].id); await text('Faculty Cycle B'); holdA = false; await releaseHeld(); await pause(200);
  assert.equal(await evaluate(`document.querySelector('main tbody').textContent.includes('Faculty Cycle A')`), false);
  await dashboard('alerts-error'); await text('Faculty alerts could not be loaded'); await rowCount(4);
  assert.equal(await evaluate(`document.querySelector('main').textContent.includes('No items need attention.')`), false);
  mode = 'normal'; await click('Retry alerts'); await rowCount(5);
  await dashboard('attention-error'); await text('Attention items could not be loaded'); await rowCount(2);
  mode = 'normal'; await click('Retry attention items'); await rowCount(5);
  await dashboard('both-error'); await text('Faculty alerts could not be loaded'); await text('Attention items could not be loaded'); await rowCount(0);
  assert.equal(await evaluate(`document.querySelector('main').textContent.includes('No items need attention.') || document.querySelector('main').textContent.includes('PRIVATE_SERVER_EXCEPTION')`), false);
  mode = 'normal'; await click('Retry alerts'); await rowCount(2); await click('Retry attention items'); await rowCount(5);
  for (const status of [401, 403, 404]) {
    listFailureStatus = status; await dashboard('alerts-error'); await text('Faculty alerts could not be loaded'); await rowCount(4);
    mode = 'normal'; await click('Retry alerts'); await rowCount(5);
  }
  listFailureStatus = 500;
  await dashboard('alerts-network'); await text('Check your connection'); await rowCount(4);
  mode = 'normal'; await click('Retry alerts'); await rowCount(5);
  await dashboard('empty'); await text('No items need attention.');
  await dashboard(); await rowCount(5);
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true); await screenshot('mobile');
  await evaluate(`document.querySelector('main a[href=${JSON.stringify(detailPath)}]').click()`);
  await text('Loading message'); holdDetail = false; await releaseHeld();
  await text('Saved reason ' + alertId); await text('Saved Creator'); await text('Saved Candidate'); await text('Saved Observer'); await text('Saved semester');
  assert(reads.includes('/api/alerts/' + alertId));
  assert.equal(await evaluate(`document.querySelector('main').textContent.includes(${JSON.stringify(savedDetails)})`), true);
  assert.equal(await evaluate(`!!window.alertExecuted || document.documentElement.scrollWidth>innerWidth`), false);
  assert.equal(await evaluate(`[...document.querySelectorAll('main button')].some(e=>/acknowledge|resolve|dismiss/i.test(e.textContent))`), false);
  assert.equal(await evaluate(`document.querySelector('main').textContent.includes('Separate second message')`), false);
  await screenshot('detail-mobile');
  for (const failureMode of ['error401', 'error403', 'error404', 'error500', 'network', 'wrong-alert', 'wrong-observation']) {
    detailMode = failureMode; await send('Page.navigate', { url: base + detailPath });
    await wait(`document.querySelector('main [role="alert"]')`);
    assert.equal(await evaluate(`document.querySelector('main').textContent.includes('PRIVATE_SERVER_EXCEPTION') || document.querySelector('main').textContent.includes(${JSON.stringify(savedDetails)})`), false);
    detailMode = 'normal'; await click('Try again'); await text('Saved reason ' + alertId);
  }
  observationFailure = true; await send('Page.navigate', { url: base + detailPath }); await text('Observation details are currently unavailable');
  observationFailure = false; await click('Retry observation'); await text('Saved reason ' + alertId);
  await evaluate(`document.querySelector('main a[href="/ac"]').click()`); await wait(`location.pathname==='/ac'`);
  assert.deepEqual(mutations, []);
  if (fixtureFailure) throw fixtureFailure;
  console.log('Passed dashboard alerts: selected-cycle GETs, pagination, stale-response isolation, stable-ID deduplication, distinct same-observation messages, preserved non-alert rows, loading/empty/partial/full errors and retries, exact saved-detail pairing, safe long text, 401/403/404/network/server failures, desktop/mobile, no lifecycle writes.');
} finally { await send('Fetch.disable').catch(() => {}); socket.close(); await fetch(`${debug}/json/close/${target.id}`).catch(() => {}); }
