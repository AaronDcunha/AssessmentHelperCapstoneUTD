import '../configuration-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const helpers = await import('../../src/lib/ac-configuration.ts');
const { ApiRequestError } = await import('../../src/lib/ac-api.ts');
const require = createRequire(import.meta.url);
const nodes = value => !value || typeof value !== 'object' ? [] : [value, ...[value.props?.children].flat(Infinity).flatMap(nodes)];
const button = (tree, label) => nodes(tree).find(node => node.type === 'Button' && node.props.children === label);
const semester = { id: 'semester', name: 'Fall 2026', year: 2026, season: 'Fall', startsOn: '2026-08-24', endsOn: '2026-12-15', timeZone: 'America/Chicago', revision: 4 };
const cycle = { id: 'cycle', semester, revision: 7, allowedActions: ['updateSettings'], signupDeadline: '2026-08-24T17:00:00.123Z', observationDeadline: '2026-12-15T18:00:00.456Z', feedbackDeadline: '2026-12-22T18:00:00.789Z' };
function harness(api, props = {}) {
  const state = [], effects = []; let cursor = 0; const cleanups = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
    useRef(initial) { const i = cursor++; return state[i] ??= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++; if (!state[i] || deps.some((d, n) => d !== state[i][n])) { state[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  const loaded = { exports: {} };
  const source = readFileSync(new URL('../../src/app/(main)/ac/semester/semester-screen.tsx', import.meta.url), 'utf8') + '\nexport { SemesterForm };';
  const mock = name => name === 'react' ? react : name === 'react/jsx-runtime' ? require(name) : name.endsWith('/ac-api') ? { acApi: api, ApiRequestError } : name.endsWith('/ac-configuration') ? helpers : name.endsWith('/unsaved-navigation') ? { guardUnsavedNavigation: () => () => {} } : new Proxy({}, { get: (_, key) => String(key) });
  new Function('require', 'module', 'exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText)(mock, loaded, loaded.exports);
  const leaveRef = { current: () => true }, saved = [], removed = [], cancelled = [];
  const config = { canManage: true, leaveRef, onSaved: (...v) => saved.push(v), onDeleted: () => removed.push(true), onCancel: () => cancelled.push(true), ...props };
  const render = () => { cursor = 0; const tree = loaded.exports.SemesterForm(config); effects.splice(0).forEach(fn => fn()); return tree; };
  const change = (name, value) => nodes(render()).find(node => node.props.name === name).props.onChange({ target: { value } });
  const submit = () => nodes(render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  return { render, change, submit, saved, removed, cancelled, leaveRef };
}
globalThis.window = { confirm: () => false };
globalThis.document = {};
test('saved settings retain exact instants/revisions; Cancel restores values and switching protects dirty edits', async () => {
  let payload;
  const app = harness({ updateCycleSettings: async (id, body) => { payload = body; return { semester: { ...semester, revision: 5 }, cycle: { ...cycle, revision: 8 } }; } }, { semester, cycle });
  app.change('startsOn', '2026-08-25'); app.render(); assert.equal(app.leaveRef.current(), false);
  button(app.render(), 'Cancel').props.onClick(); app.render(); assert.equal(app.leaveRef.current(), true);
  await app.submit(); assert.equal(payload.expectedCycleRevision, 7); assert.equal(payload.expectedSemesterRevision, 4);
  assert.equal(payload.deadlines.signupDeadline, cycle.signupDeadline); assert.equal(app.saved.length, 1);
});
test('creation prefills noon deadlines and retries the identical request after a lost response', async () => {
  const calls = []; let attempt = 0;
  const app = harness({ createSemester: async body => { calls.push(body); if (!attempt++) throw new TypeError('Lost response'); return semester; }, getEvaluationCycles: async () => [cycle] });
  app.change('startsOn', '2026-08-24'); app.change('endsOn', '2026-12-15');
  assert.equal(nodes(app.render()).find(n => n.props.name === 'feedbackDeadline').props.value, '2026-12-22T12:00');
  await app.submit(); assert.ok(button(app.render(), 'Retry creation')); assert.equal(button(app.render(), 'Cancel').props.disabled, true);
  assert.equal(app.leaveRef.current(), false); await app.submit();
  assert.deepEqual(calls[0], calls[1]); assert.ok(calls[0].creationId); assert.equal(calls[0].deadlines.observationDeadline, '2026-12-15T18:00:00.000Z'); assert.equal(app.saved.length, 1);
});
test('a semester without a cycle saves dates and creates its cycle without navigation', async () => {
  let payload;
  const app = harness({ createCycle: async body => { payload = body; return cycle; } }, { semester });
  assert.ok(button(app.render(), 'Save and Create Cycle')); await app.submit();
  assert.equal(payload.semesterId, semester.id); assert.equal(payload.expectedSemesterRevision, 4); assert.equal(payload.semester.timeZone, 'America/Chicago'); assert.equal(app.saved.length, 1);
});
test('deletion requires confirmation and sends the saved semester/cycle revisions', async () => {
  const calls = [];
  const app = harness({ deleteSemester: async (...args) => calls.push(args) }, { semester, cycle });
  assert.equal(calls.length, 0); button(app.render(), 'Delete Semester').props.onClick();
  button(app.render(), 'Keep Semester').props.onClick(); assert.equal(calls.length, 0);
  button(app.render(), 'Delete Semester').props.onClick(); await button(app.render(), 'Permanently Delete Semester').props.onClick();
  assert.deepEqual(calls, [[semester.id, { expectedRevision: 4, expectedCycleRevision: 7 }]]); assert.equal(app.removed.length, 1);
});
test('new semester Cancel exits creation; read-only users cannot save', async () => {
  const app = harness({}, { canManage: false, semester, cycle }); assert.equal(button(app.render(), 'Save Settings').props.disabled, true); await app.submit(); assert.equal(app.saved.length, 0);
  const creation = harness({}); button(creation.render(), 'Cancel').props.onClick(); assert.equal(creation.cancelled.length, 1);
});
