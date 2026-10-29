// Controlled browser fixtures only. All configuration mutations are intercepted;
// only seeded authentication and server page guards use the application database.
// Requires the local app and an isolated Edge/Chrome CDP instance on port 9225.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
assert.equal(new URL(base).hostname, 'localhost');
const debug = process.env.TEST_CDP_URL ?? 'http://127.0.0.1:9225';
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

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const semesters = [1, 2, 3].map(n => ({ id: uuid(n), name: ['Fall 2026', 'Spring 2027', 'Summer 2027'][n - 1], startsOn: null, endsOn: null, timeZone: 'America/Chicago', revision: 0 }));
let cycles = [{ id: uuid(11), semester: semesters[0] }];
let scenario = 'loading', failure, pendingSemester, pendingCycles;
const reads = [], writes = [];
const page = (items, nextCursor = null) => ({ items, pageInfo: { nextCursor, hasMore: !!nextCursor } });
async function fulfill(event, body, status = 200) {
  await send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
}
handlers.set('Fetch.requestPaused', async event => {
  try {
    const url = new URL(event.request.url), method = event.request.method;
    if (url.pathname.startsWith('/api/auth/') || url.pathname === '/api/me') { await send('Fetch.continueRequest', { requestId: event.requestId }); return; }
    if (method === 'GET') {
      reads.push(url.pathname + url.search);
      if (url.pathname === '/api/semesters') {
        if (scenario === 'loading') { pendingSemester = event; return; }
        if (scenario === 'semester-error') { await fulfill(event, { error: { code: 'FIXTURE', message: 'Unavailable' } }, 500); return; }
        if (scenario === 'empty') { await fulfill(event, page([])); return; }
        await fulfill(event, url.searchParams.has('cursor') ? page(semesters.slice(1)) : page(semesters.slice(0, 1), uuid(1))); return;
      }
      if (url.pathname === '/api/evaluation-cycles') {
        if (scenario === 'loading') { pendingCycles = event; return; }
        if (scenario === 'cycle-error') { await fulfill(event, { error: { code: 'FIXTURE', message: 'Unavailable' } }, 500); return; }
        await fulfill(event, url.searchParams.has('cursor') ? page(cycles.slice(1)) : page(cycles.slice(0, 1), cycles.length > 1 ? cycles[0].id : null)); return;
      }
      await fulfill(event, page([])); return;
    }
    // Every business mutation is intercepted, including unexpected requests.
    writes.push({ path: url.pathname, method, body: JSON.parse(event.request.postData ?? '{}') });
    assert.equal(url.pathname, '/api/evaluation-cycles'); assert.equal(method, 'POST');
    await pause(250);
    if (scenario === 'success') {
      const cycle = { id: uuid(13), semester: semesters[2], ...writes.at(-1).body, revision: 0, status: 'signup', allowedActions: ['update', 'updateSettings'] };
      cycles.push(cycle); await fulfill(event, cycle, 201);
    } else if (scenario === 'conflict') {
      cycles.push({ id: uuid(12), semester: semesters[1] });
      await fulfill(event, { error: { code: 'CONFLICT', message: 'A cycle already exists for this semester.' } }, 409);
    } else if (scenario === 'network') {
      await send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'InternetDisconnected' });
    } else {
      await fulfill(event, { error: { code: 'FIXTURE', message: 'Controlled creation failure.' } }, 422);
    }
  } catch (error) { failure = error; await send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Failed' }).catch(() => {}); }
});

const select = '[name="semesterId"]';
const deadlines = { signupDeadline: '2027-01-01T12:00', observationDeadline: '2027-02-01T12:00', feedbackDeadline: '2027-03-01T12:00' };
async function ready() { await wait(`document.querySelector('${select}')?.options.length === 4 && !document.querySelector('${select}').disabled`); }
async function preserved(id) {
  assert.equal(await evaluate(`document.querySelector('${select}').value`), id);
  for (const [key, next] of Object.entries(deadlines)) assert.equal(await evaluate(`document.querySelector('[name="${key}"]').value`), next);
}
try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  for (const [name, value] of jar) await send('Network.setCookie', { name, value, url: base, httpOnly: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: `${base}/api/*` }] });
  await navigate('/ac/cycles/new'); await textIncludes('Loading cycle configuration');
  const pendingUntil = Date.now() + 20000;
  while ((!pendingSemester || !pendingCycles) && Date.now() < pendingUntil) await pause(50);
  assert(pendingSemester && pendingCycles, 'Semester and cycle requests intercepted');
  scenario = 'normal'; await fulfill(pendingSemester, page(semesters.slice(0, 1), uuid(1)));
  await textIncludes('Checking semesters for existing cycles');
  assert.equal(await evaluate(`document.querySelector('${select}').disabled`), true);
  await fulfill(pendingCycles, page(cycles)); await ready();
  assert(reads.includes('/api/semesters?cursor=' + uuid(1)), 'Follows semester pagination');
  assert.equal(await evaluate(`document.querySelector('input[name="semesterId"]') === null`), true);
  assert.deepEqual(await evaluate(`[...document.querySelector('${select}').options].slice(1).map(e=>[e.value,e.textContent,e.disabled])`), [
    [uuid(1), 'Fall 2026 — cycle already exists', true], [uuid(2), 'Spring 2027', false], [uuid(3), 'Summer 2027', false],
  ]);
  for (const [key, next] of Object.entries(deadlines)) await value(`[name="${key}"]`, next);
  await evaluate(`document.querySelector('main form').requestSubmit()`); assert.equal(writes.length, 0, 'Selection required');
  // Direct submit events also cannot submit an occupied semester.
  await value(select, uuid(1)); await evaluate(`document.querySelector('main form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
  assert.equal(writes.length, 0);
  await value(select, uuid(2));
  await evaluate(`document.querySelector('main form').requestSubmit();document.querySelector('main form').requestSubmit()`);
  await textIncludes('Controlled creation failure'); assert.equal(writes.length, 1); await preserved(uuid(2));
  assert.deepEqual(writes[0].body, { semesterId: uuid(2), signupDeadline: '2027-01-01T18:00:00.000Z', observationDeadline: '2027-02-01T18:00:00.000Z', feedbackDeadline: '2027-03-01T18:00:00.000Z' });
  scenario = 'network'; await click('Create Cycle'); await textIncludes('Check your connection'); await preserved(uuid(2));
  scenario = 'conflict'; await click('Create Cycle'); await textIncludes('The selected semester already has'); await preserved(uuid(2));
  assert(reads.includes('/api/evaluation-cycles?cursor=' + uuid(11)), 'Checks later cycle pages after conflict');
  assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), true);
  assert.equal(await evaluate(`[...document.querySelectorAll('main button')].some(e=>e.textContent==='Reload latest cycle')`), false);
  scenario = 'semester-error'; await navigate('/ac/cycles/new'); await textIncludes('Cycle configuration unavailable');
  scenario = 'normal'; await click('Retry'); await ready();
  scenario = 'empty'; await navigate('/ac/cycles/new'); await textIncludes('No semesters are available');
  assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), true);
  scenario = 'cycle-error'; await navigate('/ac/cycles/new'); await textIncludes('Cannot check existing cycles');
  assert.equal(await evaluate(`document.querySelector('${select}').disabled`), true);
  for (const [key, next] of Object.entries(deadlines)) await value(`[name="${key}"]`, next);
  scenario = 'normal'; await click('Retry cycles'); await ready();
  for (const [key, next] of Object.entries(deadlines)) assert.equal(await evaluate(`document.querySelector('[name="${key}"]').value`), next);
  await value(select, uuid(3)); scenario = 'success'; await click('Create Cycle');
  await wait(`location.pathname === '/ac/cycles'`);
  assert.equal(writes.at(-1).body.semesterId, uuid(3));
  await navigate('/ac/cycles/new'); await textIncludes('All available semesters already have an evaluation cycle');
  assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), true);
  if (failure) throw failure;
  console.log('Passed semester dropdown: loading, pagination, UUID/name options, required/occupied selection, payload, duplicate submits, retained fields after validation/network/conflict failures, semester/cycle retry, empty/all occupied. All business writes intercepted.');
} finally { await send('Fetch.disable').catch(() => {}); socket.close(); await fetch(`${debug}/json/close/${target.id}`).catch(() => {}); }
