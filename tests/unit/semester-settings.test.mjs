import '../configuration-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const config = await import('../../src/lib/ac-configuration.ts');
const require = createRequire(import.meta.url);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const term = (n, year, season) => ({ id: id(n), name: `${season} ${year}`, year, season, startsOn: `${year}-01-01`, endsOn: `${year}-12-31`, timeZone: 'America/Chicago', revision: 2 });
const spring = term(1, 2027, 'Spring'), fall = term(2, 2026, 'Fall'), summer = term(3, 2027, 'Summer');
const deadlines = { signupDeadline: '2027-02-01T12:00:00.123Z', observationDeadline: '2027-03-01T12:00:00Z', feedbackDeadline: '2027-04-01T12:00:00Z' };
const cycle = { id: id(8), semester: spring, revision: 3, allowedActions: ['updateSettings'], ...deadlines };
const nodes = value => !value || typeof value !== 'object' ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
function harness(overrides = {}, canManage = true) {
  let state = [], cursor = 0, confirm = true;
  const calls = [], selections = [];
  const list = { data: [fall, spring, summer], loading: false, error: null };
  const api = {
    getSemesters: async () => list.data,
    getEvaluationCycles: async ({ semesterId }) => semesterId === spring.id ? [cycle] : [],
    getEvaluationCycle: async () => cycle,
    updateCycleSettings: async (id, body) => { calls.push(['save', id, body]); return { semester: { ...spring, ...body.semester, revision: 3 }, cycle: { ...cycle, ...body.deadlines, revision: 4 } }; },
    configureSemester: async (id, body) => { calls.push(['configure', id, body]); return { semester: { ...fall, ...body, revision: 3 }, cycle: { ...cycle, semester: fall } }; },
    createSemester: async body => { calls.push(['create', body]); const semester = { ...spring, id: body.id }; return { ...semester, cycle: { ...cycle, semester } }; },
    deleteSemester: async (...args) => { calls.push(['delete', ...args]); return { deleted: true }; },
    ...overrides,
  };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial }; },
    useCallback(fn) { return fn; }, useEffect() {},
  };
  const mod = { exports: {} };
  const mock = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return require(name);
    if (name.endsWith('/ac-api')) return { acApi: api };
    if (name.endsWith('/ac-configuration')) return config;
    if (name.endsWith('/cycle-context')) return { useAcCycle: () => ({ selectCycle: id => selections.push(id), refreshCycles() {} }) };
    if (name.endsWith('/use-api-resource')) return { useApiResource: () => list };
    return new Proxy({}, { get: (_, key) => key });
  };
  new Function('require', 'module', 'exports', ts.transpileModule(readFileSync(new URL('../../src/app/(main)/ac/semester/semester-screen.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText)(mock, mod, mod.exports);
  const render = () => { cursor = 0; return nodes(mod.exports.default({ canManage })); };
  const button = label => render().find(n => n.type === 'Button' && n.props.children === label);
  const input = label => render().find(n => n.props.label === label);
  return { api, calls, list, selections, render, button, input,
    confirm(value) { confirm = value; globalThis.window = { confirm: () => confirm }; },
    async select(id) { await input('Semester').props.onChange({ target: { value: id } }); await new Promise(resolve => setImmediate(resolve)); },
    change(label, value) { input(label).props.onChange({ target: { value } }); },
    async submit() { await render().find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); },
  };
}
test('all semester names are ordered newest first; a semester without cycle has an inline form', async () => {
  const app = harness(); app.confirm(true);
  assert.deepEqual(nodes(app.input('Semester')).filter(n => n.type === 'option' && n.props.value).map(n => n.props.children), ['Summer 2027', 'Spring 2027', 'Fall 2026']);
  await app.select(fall.id);
  assert.ok(app.button('Save and Create Cycle'));
  assert.equal(app.input('Semester Start').props.value, fall.startsOn);
  assert.ok(!JSON.stringify(app.render()).includes('Manage semesters'));
});
test('unsaved switching/new mode are guarded; Cancel restores the saved form', async () => {
  const app = harness(); app.confirm(true); await app.select(spring.id);
  app.change('Semester Start', '2027-01-02'); app.confirm(false);
  await app.select(fall.id); assert.equal(app.input('Semester').props.value, spring.id);
  app.button('New Semester').props.onClick(); assert.ok(!app.input('Season'));
  app.button('Cancel').props.onClick(); assert.equal(app.input('Semester Start').props.value, spring.startsOn);
  app.button('New Semester').props.onClick(); assert.ok(app.input('Season'));
  app.button('Cancel').props.onClick(); assert.ok(!app.render().some(n => n.type === 'form'));
});
test('saves preserve exact unchanged deadlines and use both revisions; no-cycle save uses semester revision', async () => {
  const app = harness(); app.confirm(true); await app.select(spring.id); await app.submit();
  assert.deepEqual(app.calls[0][2].deadlines, deadlines);
  assert.equal(app.calls[0][2].expectedCycleRevision, 3); assert.equal(app.calls[0][2].expectedSemesterRevision, 2);
  await app.select(fall.id);
  for (const [label, value] of [['Signup Deadline', '2026-02-01T12:00'], ['Observation Deadline', '2026-03-01T12:00'], ['Feedback Deadline', '2026-04-01T12:00']]) app.change(label, value);
  await app.submit(); assert.equal(app.calls[1][0], 'configure'); assert.equal(app.calls[1][2].expectedRevision, 2);
});
test('uncertain creation locks edits and retries the same UUID/payload before selecting the new semester', async () => {
  let attempts = [];
  const app = harness({ createSemester: async body => { attempts.push(body); if (attempts.length === 1) throw new TypeError('Network'); return { ...spring, id: body.id, cycle: { ...cycle, semester: { ...spring, id: body.id } } }; } });
  app.confirm(true); app.button('New Semester').props.onClick();
  for (const [label, value] of [['Year', '2027'], ['Semester Start', '2027-01-01'], ['Semester End', '2027-05-01'], ['Signup Deadline', '2027-02-01T12:00'], ['Observation Deadline', '2027-03-01T12:00'], ['Feedback Deadline', '2027-04-01T12:00']]) app.change(label, value);
  await app.submit(); assert.equal(app.button('Cancel').props.disabled, true);
  assert.equal(app.render().find(n => n.type === 'fieldset').props.disabled, true);
  await app.submit(); assert.deepEqual(attempts[1], attempts[0]); assert.equal(app.input('Semester').props.value, attempts[0].id);
});
test('deletion needs confirmation, includes revisions and clears the selection; read-only users cannot mutate', async () => {
  const app = harness(); app.confirm(true); await app.select(spring.id);
  app.button('Delete Semester').props.onClick(); assert.equal(app.calls.length, 0);
  app.button('Keep Semester').props.onClick(); assert.equal(app.calls.length, 0);
  app.button('Delete Semester').props.onClick(); await app.button('Permanently Delete Semester').props.onClick();
  assert.deepEqual(app.calls[0], ['delete', spring.id, { expectedRevision: 2, expectedCycleRevision: 3 }]);
  assert.equal(app.input('Semester').props.value, '');
  const read = harness({}, false); read.confirm(true); await read.select(spring.id);
  assert.equal(read.button('Save Settings').props.disabled, true); assert.ok(!read.button('Delete Semester')); assert.ok(!read.button('New Semester'));
});
test('failed reads expose retry; stale saves preserve edits and offer reload', async () => {
  const app = harness({ updateCycleSettings: async () => { throw Object.assign(new Error('Stale revision'), { status: 409 }); } });
  app.confirm(true); await app.select(spring.id); app.change('Semester Start', '2027-01-02'); await app.submit();
  assert.equal(app.input('Semester Start').props.value, '2027-01-02'); assert.ok(app.button('Reload latest settings'));
  app.api.getSemesters = async () => { throw new Error('Unavailable'); };
  app.confirm(true); await app.select(fall.id); assert.ok(app.button('Retry settings'));
});
