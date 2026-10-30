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
    if (name === 'next/navigation') return { useRouter: () => ({ replace: path => navigations.push(path), refresh() {} }) };
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
