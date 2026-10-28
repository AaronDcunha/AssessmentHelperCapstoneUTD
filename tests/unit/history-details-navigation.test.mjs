import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const id = '11111111-1111-4111-8111-111111111111';
function load({ permissions = ['observations.read.own', 'assessment.read.own'], workflow = { marker: 'current' } } = {}) {
  const source = readFileSync(new URL('../../src/app/(main)/observations/details/page.tsx', import.meta.url), 'utf8');
  const loaded = { exports: {} }; let workflowReads = 0;
  const details = () => null, active = () => null;
  const mockRequire = name => {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'next/navigation') return { notFound() { throw new Error('NOT_FOUND'); } };
    if (name.endsWith('/faculty-screens')) return { ObservationDetailsScreen: active };
    if (name.endsWith('/observation-details')) return { ObservationDetails: details };
    if (name.endsWith('/faculty-routes')) return { facultyRoutes: { history: '/observations/history' } };
    if (name.endsWith('/faculty-page-data')) return { facultyPageData: async () => { workflowReads++; return { data: workflow }; } };
    if (name.endsWith('/permissions')) return { requirePermission: async permission => { if (!permissions.includes(permission)) throw new Error('FORBIDDEN'); return { permissions }; } };
    throw new Error(name);
  };
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } });
  new Function('require', 'module', 'exports', outputText)(mockRequire, loaded, loaded.exports);
  return { page: loaded.exports.default, details, active, reads: () => workflowReads };
}
test('History record destination preserves the selected ID instead of resolving the active observation', async () => {
  const app = load(); const result = await app.page({ searchParams: Promise.resolve({ observationId: id }) });
  assert.equal(result.type, app.details); assert.equal(result.props.observationId, id);
  assert.equal(result.props.backHref, '/observations/history'); assert.equal(result.props.canReadAssessment, true);
  assert.equal(app.reads(), 0);
});
test('the existing no-ID details destination keeps the active workflow', async () => {
  const app = load(); const result = await app.page({ searchParams: Promise.resolve({}) });
  assert.equal(result.type, app.active); assert.equal(result.props.data.marker, 'current'); assert.equal(app.reads(), 1);
});
test('direct record links enforce own-read grant and independently gate assessment loading', async () => {
  const denied = load({ permissions: ['test:admin'] });
  await assert.rejects(denied.page({ searchParams: Promise.resolve({ observationId: id }) }), /FORBIDDEN/);
  const allowed = load({ permissions: ['observations.read.own'] });
  assert.equal((await allowed.page({ searchParams: Promise.resolve({ observationId: id }) })).props.canReadAssessment, false);
});
test('malformed and repeated record IDs cannot fall back to the active observation', async () => {
  for (const observationId of ['bad', '', [id, id]]) {
    const app = load(); await assert.rejects(app.page({ searchParams: Promise.resolve({ observationId }) }), /NOT_FOUND/);
    assert.equal(app.reads(), 0);
  }
});
