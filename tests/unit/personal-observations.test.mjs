import '../configuration-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const { getPersonalObservations, personalObservationFilters } = await import('../../src/server/queries/personal-observations.ts');
const { ConfigurationError } = await import('../../src/server/configuration-validation.ts');
const user = { id: '11111111-1111-4111-8111-111111111111', permissions: ['observations.read.own'] };
const forbidden = () => assert.fail('Unexpected persistence access');

test('personal observation filters reject ownership overrides, duplicates and invalid pagination before querying', async () => {
  for (const query of ['userId=other', 'professorId=other', 'limit=0', 'limit=101', 'limit=1.2', 'limit=1&limit=2', 'cycleId=bad', 'semesterId=', 'cursor=foreign', 'status=bad', 'participation=ac', 'assessmentStatus=unknown']) {
    await assert.rejects(getPersonalObservations({ observation: { findFirst: forbidden, findMany: forbidden } }, user, new URLSearchParams(query)), e => e.status === 400);
  }
  assert.equal(personalObservationFilters(new URLSearchParams()).limit, 20);
  assert.equal(personalObservationFilters(new URLSearchParams('assessmentStatus=completed')).assessmentStatus, 'COMPLETED');
});
test('own read requires its exact business grant even for a broadly privileged caller', async () => {
  await assert.rejects(getPersonalObservations({ observation: { findMany: forbidden } }, { ...user, permissions: ['observations.read', 'test:admin'] }, new URLSearchParams()), e => e.status === 403);
  assert.deepEqual((await getPersonalObservations({ observation: { findMany: forbidden } }, { ...user, id: 'demo:faculty' }, new URLSearchParams())).items, []);
});
test('cursor validation includes ownership and filters; a foreign or filtered-out anchor cannot be used', async () => {
  const cursor = '22222222-2222-4222-8222-222222222222';
  const db = { observation: { findFirst: async args => {
    const clauses = args.where.AND;
    assert.deepEqual(clauses[0], { observer: { userId: user.id } });
    assert.ok(clauses.some(c => c.status === 'COMPLETED'));
    return null;
  }, findMany: forbidden } };
  await assert.rejects(getPersonalObservations(db, user, new URLSearchParams({ participation: 'observer', status: 'COMPLETED', cursor })), e => e.status === 400);
});

function route({ actor = user, execute = async () => ({ items: [], pageInfo: { hasMore: false, nextCursor: null } }) } = {}) {
  const source = readFileSync(new URL('../../src/app/api/me/observations/route.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const loaded = { exports: {} };
  const require = name => {
    if (name.endsWith('/permissions')) return { checkApiPermission: async () => actor };
    if (name.endsWith('/prisma')) return { getPrisma: () => ({}) };
    if (name.endsWith('/configuration-validation')) return { ConfigurationError };
    if (name.endsWith('/personal-observations')) return { getPersonalObservations: execute };
    throw new Error(name);
  };
  new Function('require', 'module', 'exports', outputText)(require, loaded, loaded.exports);
  return loaded.exports.GET;
}
test('HTTP route preserves structured private errors, authentication, denial and database failure handling', async () => {
  for (const status of [401, 403]) {
    const response = await route({ actor: new Response(null, { status }), execute: forbidden })(new Request('http://localhost/api/me/observations'));
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await response.json()).error.code, status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN');
  }
  const unavailable = await route({ execute: async () => { throw new Error('SECRET database details'); } })(new Request('http://localhost/api/me/observations'));
  assert.equal(unavailable.status, 503); assert.doesNotMatch(await unavailable.text(), /SECRET/);
  const invalid = await route({ execute: async () => { throw new ConfigurationError(400, 'INVALID_QUERY', 'Invalid cursor.'); } })(new Request('http://localhost/api/me/observations'));
  assert.equal(invalid.status, 400);
  const ok = await route()(new Request('http://localhost/api/me/observations'));
  assert.equal(ok.status, 200); assert.deepEqual((await ok.json()).items, []);
});
