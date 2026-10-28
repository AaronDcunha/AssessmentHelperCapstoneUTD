// Controlled browser fixtures only. All configuration mutations are intercepted;
// only seeded authentication and server page guards use the application database.
// Requires the local app and an isolated Edge/Chrome CDP instance on port 9225.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
async function label(labelText, next) {
  const selector = await evaluate(`(() => { const label=[...document.querySelectorAll('main label')].find(e=>e.textContent===${JSON.stringify(labelText)}); return label ? '#' + CSS.escape(label.htmlFor) : ''; })()`);
  assert(selector, 'Field label: ' + labelText); await value(selector, next);
}
async function click(text) { assert(await evaluate(`(() => {const e=[...document.querySelectorAll('main button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!e||e.disabled)return false;e.click();return true;})()`), 'Enabled button: ' + text); }
async function textIncludes(text) { await wait(`document.querySelector('main')?.textContent.includes(${JSON.stringify(text)})`); }
async function shot(name) { const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); writeFileSync(join(tmpdir(), `ac-configuration-${name}.png`), Buffer.from(image.data, 'base64')); }

const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const semesters = [1, 2, 3].map(number => ({ id: uuid(number), name: ['Fall 2026', 'Spring 2027', 'Summer 2027'][number - 1], startsOn: null, endsOn: null, timeZone: 'America/Chicago', revision: 0 }));
let cycles = [1, 2].map(number => ({ id: uuid(number + 10), semester: structuredClone(semesters[number - 1]), signupDeadline: '2026-10-31T23:59:22.123Z', observationDeadline: '2026-11-30T23:59:00Z', feedbackDeadline: '2027-01-10T23:59:00Z', revision: 0, status: 'signup', allowedActions: ['update', 'updateSettings'] }));
const custom = { id: uuid(30), title: 'Fixture custom draft', status: 'draft', publishedAt: null, revision: 4, criteria: [
  { id: uuid(31), key: 'rating-first', prompt: 'Custom rating first', type: 'rating', required: true, order: 0, weight: 2.5, options: [{ value: 0, label: 'Not demonstrated' }, { value: 10, label: 'Demonstrated' }] },
  { id: uuid(32), key: 'rating-second', prompt: 'Custom rating second', type: 'rating', required: false, order: 1, weight: 1, options: [{ value: -1, label: 'Below' }, { value: 1, label: 'Above' }] },
  { id: uuid(33), key: 'long', prompt: 'Existing long response', type: 'text', required: false, order: 2, weight: 0 },
], commentPrompts: [{ id: uuid(34), prompt: 'Additional comments', required: false, order: 0 }], signatureLabels: { observee: 'Faculty acknowledgement', observer: 'Observer acknowledgement' } };
let templates = [structuredClone(custom), { ...structuredClone(custom), id: uuid(40), title: 'Fixture published', status: 'published', publishedAt: '2026-10-01T12:00:00Z' }];
const list = items => ({ items, pageInfo: { nextCursor: null, hasMore: false } });
let mode = '', fixtureFailure, idCounter = 100;
const writes = [];
handlers.set('Page.javascriptDialogOpening', () => send('Page.handleJavaScriptDialog', { accept: true }));
handlers.set('Fetch.requestPaused', async event => {
  try {
    const url = new URL(event.request.url), path = url.pathname, method = event.request.method;
    let body, status = 200;
    if (path.startsWith('/api/auth/') || path === '/api/me') { await send('Fetch.continueRequest', { requestId: event.requestId }); return; }
    if (method !== 'GET') writes.push({ path, method, input: JSON.parse(event.request.postData ?? '{}') });
    if (mode === 'network') { mode = ''; await send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'InternetDisconnected' }); return; }
    if (mode.startsWith('error')) { status = Number(mode.slice(5)); mode = ''; body = { error: { code: 'FIXTURE_ERROR', message: status === 409 ? 'Another editor saved a newer revision.' : 'Fixture request rejected.' } }; }
    else if (method === 'GET') {
      if (path === '/api/evaluation-cycles') body = list(cycles);
      else if (path === '/api/semesters') body = list(semesters);
      else if (/^\/api\/evaluation-cycles\/[^/]+$/.test(path)) body = cycles.find(item => item.id === path.split('/').at(-1));
      else if (path === '/api/observation-templates') body = list(templates.map(({ id, title, status, publishedAt, revision }) => ({ id, title, status, publishedAt, revision })));
      else if (path.startsWith('/api/observation-templates/')) body = templates.find(item => item.id === path.split('/').at(-1));
      else { status = 404; body = { error: { code: 'UNEXPECTED_READ', message: 'Fixture read unavailable.' } }; }
    } else if (path === '/api/evaluation-cycles' && method === 'POST') {
      const input = writes.at(-1).input;
      assert.equal(Object.keys(input).sort().join(','), 'feedbackDeadline,observationDeadline,semesterId,signupDeadline');
      assert(Object.values(input).slice(1).every(value => typeof value === 'string'));
      const cycle = { id: uuid(13), semester: structuredClone(semesters.find(item => item.id === input.semesterId)), ...input, revision: 0, status: 'signup', allowedActions: ['update', 'updateSettings'] };
      cycles.push(cycle); body = cycle; status = 201; await pause(200);
    } else if (path.startsWith('/api/evaluation-cycles/')) {
      const cycle = cycles.find(item => item.id === path.split('/')[3]), input = writes.at(-1).input;
      assert(cycle);
      if (method === 'PATCH') { assert.equal(input.expectedRevision, cycle.revision); assert.equal('semesterId' in input, false); Object.assign(cycle, { ...input, revision: cycle.revision + 1 }); body = cycle; }
      else {
        assert.equal(method, 'PUT'); assert(path.endsWith('/settings'));
        assert.equal(input.expectedCycleRevision, cycle.revision); assert.equal(input.expectedSemesterRevision, cycle.semester.revision);
        assert(input.deadlines.signupDeadline.endsWith('Z'));
        Object.assign(cycle, input.deadlines, { revision: cycle.revision + 1 }); Object.assign(cycle.semester, input.semester, { revision: cycle.semester.revision + 1 });
        body = { semester: cycle.semester, cycle };
        if (mode === 'slow-settings') { mode = ''; await pause(400); }
      }
    } else if (path.startsWith('/api/observation-templates')) {
      const input = structuredClone(writes.at(-1).input);
      let template = templates.find(item => item.id === path.split('/')[3]);
      if (path.endsWith('/publish')) { assert.equal(input.expectedRevision, template.revision); template.status = 'published'; template.publishedAt = '2026-10-26T12:00:00Z'; template.revision++; body = template; }
      else {
        if (method === 'PATCH') { assert.equal(input.expectedRevision, template.revision); }
        else { assert.equal(method, 'POST'); template = { id: uuid(++idCounter), revision: -1, status: 'draft', publishedAt: null }; templates.push(template); status = 201; }
        assert(input.criteria.every((item, index) => item.key && item.order === index && (item.type === 'text' ? !('options' in item) : item.options.length >= 2)));
        assert(!Array.isArray(input.signatureLabels)); assert(input.commentPrompts.every(item => typeof item === 'object'));
        for (const item of input.criteria) { assert(!('uiId' in item)); if (!item.id) item.id = uuid(++idCounter); }
        for (const item of input.commentPrompts) if (!item.id) item.id = uuid(++idCounter);
        Object.assign(template, input, { revision: template.revision + 1 }); body = template;
      }
    } else throw new Error('Unexpected mutation blocked: ' + path);
    if (!body) { status = 404; body = { error: { code: 'NOT_FOUND', message: 'Fixture record not found.' } }; }
    await send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from(JSON.stringify(body)).toString('base64') });
  } catch (error) { fixtureFailure = error; await send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Failed' }); }
});

try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  for (const [name, value] of jar) await send('Network.setCookie', { name, value, url: base, httpOnly: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Fetch.enable', { patterns: [{ urlPattern: `${base}/api/*` }] });
  await navigate('/ac/cycles'); await textIncludes('Spring 2027');
  await evaluate(`document.querySelector('button[aria-label="Actions for Fall 2026"]').click()`);
  await wait(`document.activeElement?.textContent==='Edit Cycle'`);
  await shot('cycles-desktop');
  await navigate('/ac/cycles/new'); await wait(`document.querySelector('[name="semesterId"]')?.options.length===4`);
  await value('[name="semesterId"]', uuid(3));
  for (const [key, next] of Object.entries({ signupDeadline: '2027-03-01T12:00', observationDeadline: '2027-02-01T12:00', feedbackDeadline: '2027-06-01T12:00' })) await value(`[name="${key}"]`, next);
  await click('Create Cycle'); await textIncludes('Deadlines must be ordered'); assert.equal(writes.length, 0);
  await value('[name="signupDeadline"]', '2027-01-01T12:00');
  await evaluate(`document.querySelector('main form').requestSubmit();document.querySelector('main form').requestSubmit()`);
  await wait(`location.pathname==='/ac/cycles' && document.querySelector('main').textContent.includes('Summer 2027')`);
  assert.equal(writes.filter(item => item.method === 'POST').length, 1);
  await navigate(`/ac/cycles/${uuid(13)}/edit`); await wait(`document.querySelector('[name="signupDeadline"]')?.value==='2027-01-01T12:00' || document.querySelector('[name="signupDeadline"]')?.value==='2027-01-01T12:00:00'`);
  await value('[name="signupDeadline"]', '2027-01-02T13:00'); await click('Save Changes'); await wait(`location.pathname==='/ac/cycles'`);
  assert.equal(writes.at(-1).input.expectedRevision, 0); assert.equal('semesterId' in writes.at(-1).input, false);

  await navigate('/ac/semester'); await wait(`document.querySelector('[name="cycleId"]')?.options.length===4`);
  assert.equal(await evaluate(`!!document.querySelector('[name="startsOn"]')`), false, 'Multiple cycles require explicit selection');
  await value('[name="cycleId"]', uuid(11)); await textIncludes('Semester boundaries have not been configured');
  await value('[name="startsOn"]', '2026-08-20'); await value('[name="endsOn"]', '2026-12-20');
  await click('Save Settings'); await textIncludes('Settings saved.');
  assert.equal(writes.at(-1).input.deadlines.signupDeadline, '2026-10-31T23:59:22.123Z');
  await value('[name="startsOn"]', '2026-08-21'); await click('Save Settings'); await textIncludes('Settings saved.');
  assert.equal(writes.at(-1).input.expectedCycleRevision, 1); assert.equal(writes.at(-1).input.expectedSemesterRevision, 1);
  await value('[name="startsOn"]', '2026-08-22'); await click('Cancel'); assert.equal(await evaluate(`document.querySelector('[name="startsOn"]').value`), '2026-08-21');
  mode = 'error409'; await value('[name="startsOn"]', '2026-08-23'); await click('Save Settings'); await textIncludes('newer revision');
  assert.equal(await evaluate(`document.querySelector('[name="startsOn"]').value`), '2026-08-23');
  await click('Reload latest settings'); await wait(`document.querySelector('[name="startsOn"]').value==='2026-08-21'`);
  // A completed save for the old selection must not select that cycle again.
  mode = 'slow-settings'; await value('[name="startsOn"]', '2026-08-24'); await click('Save Settings');
  await value('[name="cycleId"]', uuid(12)); await textIncludes('Semester boundaries have not been configured'); await pause(500);
  assert.equal(await evaluate(`document.querySelector('[name="cycleId"]').value`), uuid(12));
  await value('[name="cycleId"]', uuid(11)); await wait(`document.querySelector('[name="startsOn"]')?.value==='2026-08-24'`);
  await shot('semester-desktop');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true); await shot('semester-mobile');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  await navigate('/ac/template'); await wait(`document.querySelector('[name="templateId"]')?.options.length===3`);
  await value('[name="templateId"]', custom.id); await wait(`document.querySelector('input[placeholder="Enter your question"]')?.value==='Custom rating first'`);
  await evaluate(`document.querySelector('[role="tab"]').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))`);
  await wait(`document.querySelector('[role="tab"][aria-selected="true"]').textContent.includes('Long responses')`);
  await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`);
  await wait(`document.querySelector('[role="tab"][aria-selected="true"]').textContent.includes('Scale questions')`);
  await value(`[name="${uuid(31)}"]`, 'Unsaved custom rating');
  await click('↓ Move down');
  await click('Next section →'); await textIncludes('Long responses');
  await value(`[name="${uuid(33)}"]`, 'Unsaved long response');
  await click('+ Add question');
  const newTextName = await evaluate(`document.querySelectorAll('input[placeholder="Enter your question"]')[1].name`);
  await value(`[name="${newTextName}"]`, 'New long-response question');
  await click('Next section →'); await label('Comment prompt text', 'Unsaved comments'); await label('Faculty / observee signature label', 'Custom faculty label');
  await click('Preview form'); await textIncludes('Demonstration responses are not saved');
  assert.equal(await evaluate(`[...document.querySelectorAll('[role="radiogroup"]')].map(e=>e.textContent).join(' ').includes('10 · Demonstrated')`), true);
  assert.equal(await evaluate(`document.querySelector('main').textContent.includes('Unsaved long response') && document.querySelector('main').textContent.includes('Unsaved comments') && document.querySelector('main').textContent.includes('Custom faculty label')`), true);
  await shot('template-preview-desktop');
  const beforePreview = writes.length;
  await evaluate(`document.querySelector('input[type="radio"]').click()`); assert.equal(writes.length, beforePreview);
  await click('← Return to editor'); await textIncludes('Comments & signatures');
  assert.equal(await evaluate(`[...document.querySelectorAll('main input')].some(e=>e.value==='Unsaved comments')`), true);
  await click('Save template'); await textIncludes('Draft saved.');
  const savedInput = writes.at(-1).input;
  assert.equal(savedInput.expectedRevision, 4); assert.deepEqual(savedInput.criteria.slice(0, 2).map(item => item.id), [uuid(32), uuid(31)]);
  assert.equal('id' in savedInput.criteria.at(-1), false); assert.equal(savedInput.criteria.find(item => item.id === uuid(31)).weight, 2.5);
  assert.deepEqual(savedInput.criteria.find(item => item.id === uuid(31)).options, custom.criteria[0].options);
  assert.equal(savedInput.commentPrompts[0].id, uuid(34));
  mode = 'error409'; await label('Template title', 'Still unsaved after conflict'); await click('Save template'); await textIncludes('newer revision');
  assert.equal(await evaluate(`[...document.querySelectorAll('main input')].some(e=>e.value==='Still unsaved after conflict')`), true);
  await click('Save template'); await textIncludes('Draft saved.'); assert.equal(writes.at(-1).input.expectedRevision, 5);
  await click('Publish template'); await textIncludes('Template published.'); assert.equal(writes.at(-1).input.expectedRevision, 6);
  await click('← Previous section'); await wait(`[...document.querySelectorAll('main input')].some(e=>e.value==='New long-response question')`);
  await click('← Previous section'); await shot('template-scale-desktop');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true); await shot('template-mobile');
  await click('Preview form'); assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), true); await shot('template-preview-mobile');
  await click('← Return to editor');
  await click('+ New template'); await textIncludes('Unsaved draft'); await click('+ Add question'); await label('Question text', 'Created fixture question');
  await click('Save template'); await textIncludes('Draft saved.'); assert.equal(writes.at(-1).method, 'POST');
  await label('Template title', 'Second save after create'); await click('Save template'); await textIncludes('Draft saved.'); assert.equal(writes.at(-1).method, 'PATCH'); assert.equal(writes.at(-1).input.expectedRevision, 0);
  for (const status of [401, 403, 404, 422, 500]) {
    await label('Template title', 'Preserve edits ' + status); mode = 'error' + status; await click('Save template'); await wait(`document.querySelector('main [role="alert"]')`);
    assert.equal(await evaluate(`[...document.querySelectorAll('main input')].some(e=>e.value===${JSON.stringify('Preserve edits ' + status)})`), true);
  }
  mode = 'network'; await click('Save template'); await textIncludes('Check your connection');
  mode = 'error500'; await navigate('/ac/cycles'); await textIncludes('server could not'); await click('Retry cycles'); await textIncludes('Summer 2027');
  if (fixtureFailure) throw fixtureFailure;
  console.log('Passed AC configuration browser fixtures: cycle list/create/edit, duplicate-submit protection, settings revisions/cancel/conflict, custom scales/IDs/order, all sections, unsaved preview/return, draft/create/update/publish, errors/retry, desktop/mobile. All configuration writes were intercepted.');
} finally { await send('Fetch.disable').catch(() => {}); socket.close(); await fetch(`${debug}/json/close/${target.id}`).catch(() => {}); }
