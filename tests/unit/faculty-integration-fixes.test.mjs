import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const nodes = value => !value || typeof value !== 'object' ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
function harness(file, post = async () => ({ message: 'Saved' })) {
  let state = [], cursor = 0, cleanups = [];
  const navigations = [];
  const react = { useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; }, useRef(initial) { const index = cursor++; return state[index] ??= { current: initial }; }, useEffect(fn) { const index = cursor++; if (!(index in state)) { state[index] = true; cleanups.push(fn()); } } };
  const loaded = { exports: {} };
  const mock = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'next/navigation') return { useRouter: () => ({ replace: path => navigations.push(path), refresh: () => navigations.push('refresh') }) };
    if (name.endsWith('faculty-api')) return { postFacultyAction: post };
    if (name.endsWith('faculty-routes')) return { facultyRoutes: { details: '/observations/details' } };
    return new Proxy({}, { get: (_, key) => String(key) });
  };
  new Function('require', 'module', 'exports', ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText)(mock, loaded, loaded.exports);
  return { exports: loaded.exports, navigations, render(fn, props) { cursor = 0; return fn(props); }, unmount() { cleanups.forEach(fn => fn?.()); cleanups = []; state = []; cursor = 0; } };
}

test('finalized assessment navigates every section without writes and keeps submission disabled', async () => {
  let writes = 0;
  const app = harness('../../src/components/observations/faculty-assessment-screen.tsx', async () => { writes++; });
  const initial = { locked: true, canEdit: false, canAcknowledge: false, criteria: [], commentPrompts: [], signatureLabels: {}, responses: { answers: {}, comments: 'Retained comment' } };
  const render = () => app.render(app.exports.FacultyAssessmentScreen, { initial });
  const previousRaf = globalThis.requestAnimationFrame; globalThis.requestAnimationFrame = () => {};
  try {
    for (let step = 1; step <= 3; step++) {
      const tree = render(), all = nodes(tree), form = all.find(n => n.type === 'form'), button = all.find(n => n.type === 'Button' && n.props.type === 'submit');
      assert.equal(all.find(n => n.props.id === 'form-step').props.children[1], step);
      assert.equal(button.props.disabled, step === 3);
      await form.props.onSubmit({ preventDefault() {} });
    }
    assert.equal(writes, 0);
  } finally { globalThis.requestAnimationFrame = previousRaf; }
});

test('cycle changes remount signup inputs and ignore a late response from the previous cycle', async () => {
  let resolvePost;
  const app = harness('../../src/components/observations/faculty-screens.tsx', () => new Promise(resolve => { resolvePost = resolve; }));
  const data = cycle => ({ dashboard: { cycle: { id: cycle, signupDeadline: '2098-01-01T00:00:00Z', timeZone: 'America/Chicago' } }, sections: [{ id: 'course-' + cycle, label: cycle, options: [] }], signup: { allowed: true, observationDeadline: '2099-01-01' } });
  const renderShell = cycle => app.exports.SignupScreen({ data: data(cycle) });
  const fall = renderShell('fall'); let form = app.render(fall.type, fall.props);
  nodes(form).find(n => n.type === 'Select').props.onChange({ target: { value: 'course-fall' } });
  form = app.render(fall.type, fall.props);
  nodes(form).find(n => n.type === 'ProposedDateSelector').props.onChange(['2098-11-01']);
  form = app.render(fall.type, fall.props);
  const pending = form.props.onSubmit({ preventDefault() {} });
  app.unmount(); const spring = renderShell('spring'); assert.notEqual(fall.key, spring.key);
  form = app.render(spring.type, spring.props);
  assert.equal(nodes(form).find(n => n.type === 'Select').props.value, '');
  assert.equal(nodes(form).find(n => n.type === 'Button' && n.props.type === 'submit').props.disabled, false);
  resolvePost({ message: 'Fall saved' }); await pending; assert.deepEqual(app.navigations, []);
});

test('failed signup loading offers retry and never claims there are no assigned courses', () => {
  const app = harness('../../src/components/observations/faculty-screens.tsx');
  const shell = app.exports.SignupScreen({ data: null }), tree = app.render(shell.type, shell.props);
  const text = JSON.stringify(tree); assert.ok(text.includes('Unable to load your courses')); assert.ok(text.includes('Retry')); assert.ok(!text.includes('No assigned course'));
});

const invitationData = (request = {}, actions = {}) => ({
  dashboard: { access: { observations: true }, cycle: { timeZone: 'America/Chicago' } },
  links: { allowedActions: { respond: true, lateAcceptance: true, ...actions }, requests: [{
    id: 'candidate', attemptId: 'attempt', observee: 'Observee', course: 'TEST', section: '1',
    expiresAt: '2098-01-01T00:00:00Z', expired: false, status: 'PENDING', approvalStatus: null,
    options: [{ id: 'meeting', date: '2098-01-01', meetingTime: '10:00' }], ...request,
  }] },
});
const button = (tree, label) => nodes(tree).find(node => node.type === 'Button' && node.props.children === label);

test('decline needs no meeting, posts existing attempt payload, and removes the card only after success', async () => {
  for (const fail of [false, true]) {
    let settle; const calls = [];
    const app = harness('../../src/components/observations/faculty-screens.tsx', (path, body) => {
      calls.push({ path, body }); return new Promise((resolve, reject) => { settle = () => fail ? reject(Error('Reload invitation')) : resolve({ message: 'Invitation declined.' }); });
    });
    const render = () => app.render(app.exports.RequestsScreen, { data: invitationData() });
    assert.equal(button(render(), 'Decline').props.disabled, false);
    const work = button(render(), 'Decline').props.onClick();
    assert.equal(button(render(), 'Declining…').props.disabled, true);
    assert.equal(button(render(), 'Accept selected date').props.disabled, true);
    assert.deepEqual(calls, [{ path: 'requests/decline', body: { candidateId: 'candidate', attemptId: 'attempt' } }]);
    settle(); await work;
    assert.equal(!!button(render(), 'Decline'), fail);
    assert.ok(JSON.stringify(render()).includes(fail ? 'Reload invitation' : 'Invitation declined.'));
    assert.deepEqual(app.navigations, fail ? [] : ['refresh']);
  }
});

test('accept and late approval keep distinct busy labels and their existing payloads', async () => {
  for (const late of [false, true]) {
    let finish; const calls = [];
    const app = harness('../../src/components/observations/faculty-screens.tsx', (path, body) => { calls.push({ path, body }); return new Promise(resolve => { finish = resolve; }); });
    const data = invitationData(late ? { expired: true, status: 'EXPIRED' } : {}, late ? { respond: false } : {});
    const render = () => app.render(app.exports.RequestsScreen, { data });
    if (!late) nodes(render()).find(node => node.type === 'input' && node.props.type === 'radio').props.onChange();
    const control = button(render(), late ? 'Request AC approval' : 'Accept selected date');
    assert.equal(control.props.disabled, false);
    const work = control.props.onClick();
    assert.equal(button(render(), late ? 'Requesting approval…' : 'Accepting…').props.disabled, true);
    assert.ok(button(render(), 'Decline')); assert.ok(!button(render(), 'Declining…'));
    finish({ message: 'Saved' }); await work;
    assert.deepEqual(calls, [{ path: late ? 'requests/late-acceptance' : 'requests/accept', body: { candidateId: 'candidate', attemptId: 'attempt', ...(!late ? { meetingOptionId: 'meeting' } : {}) } }]);
    assert.deepEqual(app.navigations, ['refresh']);
  }
});

test('request controls respect response permissions, closed states, expiry and independent late approval grants', () => {
  for (const [request, actions] of [[{}, { respond: false }], [{ status: 'ACCEPTED' }, {}], [{ status: 'CANCELLED' }, {}], [{ expired: true, status: 'EXPIRED' }, { lateAcceptance: false }]]) {
    const app = harness('../../src/components/observations/faculty-screens.tsx');
    const tree = app.render(app.exports.RequestsScreen, { data: invitationData(request, actions) });
    assert.equal(button(tree, 'Decline').props.disabled, true);
    assert.equal(button(tree, request.status === 'ACCEPTED' ? 'Availability recorded' : 'Accept selected date').props.disabled, true);
    assert.equal(nodes(tree).find(node => node.type === 'input').props.disabled, true);
    if (request.expired) assert.equal(button(tree, 'Request AC approval').props.disabled, true);
  }
});

test('candidate statuses are readable while only eligible candidates can be invited and accepted candidates confirmed', async () => {
  const calls = [], app = harness('../../src/components/observations/faculty-candidates.tsx', async (path, body) => { calls.push({ path, body }); return { message: 'Saved' }; });
  const states = ['ELIGIBLE', 'PENDING', 'DECLINED', 'ACCEPTED', 'EXPIRED', 'CANCELLED'];
  const data = { dashboard: { access: { observations: true } }, observation: { id: 'observation' }, links: { allowedActions: { invite: true, select: true }, recommendations: states.map((status, i) => ({ id: `candidate-${i}`, observationId: 'observation', name: status, status, dates: ['2098-01-01'], acceptedMeeting: { startsAt: '2098-01-01T16:00:00Z', endsAt: '2098-01-01T17:00:00Z', timeZone: 'America/Chicago' } })) } };
  const render = accepted => app.render(app.exports.FacultyCandidates, { data, accepted });
  let tree = render(false);
  const badges = nodes(tree).filter(node => node.type === 'span').map(node => node.props.children);
  assert.deepEqual(badges, ['Not invited', 'Pending', 'Declined', 'Accepted', 'Expired', 'Cancelled']);
  const checkboxes = nodes(tree).filter(node => node.type === 'input');
  assert.deepEqual(checkboxes.map(node => node.props.disabled), [false, true, true, true, true, true]);
  checkboxes[0].props.onChange({ target: { checked: true } });
  tree = render(false); assert.equal(button(tree, 'Send Requests').props.disabled, false);
  await button(tree, 'Send Requests').props.onClick();
  assert.deepEqual(calls[0], { path: 'invitations', body: { observationId: 'observation', candidateIds: ['candidate-0'] } });
  tree = render(true); assert.equal(button(tree, 'Confirm Observer').props.disabled, false);
  assert.deepEqual(nodes(tree).filter(node => node.type === 'span').map(node => node.props.children), ['Accepted']);
  await button(tree, 'Confirm Observer').props.onClick();
  assert.deepEqual(calls[1], { path: 'selected-observer', body: { candidateId: 'candidate-3' } });
  const empty = app.render(app.exports.FacultyCandidates, { data: null });
  assert.equal(nodes(empty).find(node => node.type === 'td').props.colSpan, 4);
});
