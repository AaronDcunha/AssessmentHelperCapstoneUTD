import '../configuration-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const { getCycleSignups } = await import('../../src/server/queries/cycle-signups.ts');
const { ConfigurationError } = await import('../../src/server/configuration-validation.ts');
const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const actor = { id: id(1), permissions: ['signups.read'] };
const cycleId = id(2);
const forbidden = () => assert.fail('Unexpected database access');
const url = query => new URL(`http://localhost/api/evaluation-cycles/${cycleId}/signups${query ? '?' + query : ''}`);
function row(n = 3) {
  return {
    signupId: id(n), signupDate: new Date('2026-10-20T15:00:00Z'),
    professor: { user: { userId: id(10), fullName: 'Faculty One', email: 'one@test.invalid', passwordHash: 'SECRET' } },
    section: { sectionId: id(11), sectionCode: '001', semesterId: id(12), semester: { timeZone: 'America/Chicago' },
      course: { courseId: id(13), courseCode: 'CS 4348', courseTitle: 'Operating Systems', departmentId: id(14), courseLevel: 4000 },
      classMeetings: [{ meetingId: id(15), dayOfWeek: 'Monday', startTime: '10:00', endTime: '11:15', location: 'Current room' }] },
    observations: [{ observationId: id(16), workflowRevision: 4, recommendationGenerationId: id(17),
      recommendationsReleasedAt: new Date('2026-10-25T18:00:00Z'), timeOptions: [
        { timeOptionId: id(18), preferredDate: new Date('2026-11-09'), startsAt: new Date('2026-11-09T16:00:00Z'),
          endsAt: new Date('2026-11-09T17:15:00Z'), timeZone: 'America/Chicago', location: 'Snapshot room' },
        { timeOptionId: id(19), preferredDate: new Date('2026-11-11'), startsAt: null, endsAt: null, timeZone: null, location: null },
      ] }],
  };
}
function database(rows = []) {
  return { evaluationCycle: { findUnique: async () => ({ cycleId }) },
    evaluationSignup: { findMany: async () => rows, findFirst: async () => ({ signupId: rows[0]?.signupId }) } };
}

test('signup read returns database identities, snapshots and raw release markers without inferred matches', async () => {
  const result = await getCycleSignups(database([row()]), actor, cycleId, url());
  const item = result.items[0];
  assert.deepEqual(item.observee, { id: id(10), name: 'Faculty One', email: 'one@test.invalid' });
  assert.equal(item.section.course.level, 4000);
  assert.equal(item.section.sectionNumber, '001');
  assert.equal(item.section.meetings[0].timeZone, 'America/Chicago');
  assert.equal(item.observationId, id(16));
  assert.equal(item.observationRevision, 4);
  assert.equal(item.recommendationGenerationId, id(17));
  assert.equal(item.recommendationsReleasedAt, '2026-10-25T18:00:00.000Z');
  assert.deepEqual(item.proposedMeetings[0], { id: id(18), sectionId: id(11), date: '2026-11-09',
    startsAt: '2026-11-09T16:00:00.000Z', endsAt: '2026-11-09T17:15:00.000Z', timeZone: 'America/Chicago', location: 'Snapshot room' });
  assert.deepEqual(item.proposedMeetings[1], { id: id(19), sectionId: id(11), date: '2026-11-11',
    startsAt: null, endsAt: null, timeZone: null, location: null });
  assert.doesNotMatch(JSON.stringify(result), /SECRET|candidateCount|matchResult|generationStatus|available/);
  assert.deepEqual(result.pageInfo, { nextCursor: null, hasMore: false });
});

test('empty cycles and signups without observations remain explicit empty/null data', async () => {
  assert.deepEqual(await getCycleSignups(database(), actor, cycleId, url()), { items: [], pageInfo: { nextCursor: null, hasMore: false } });
  const noObservation = row(); noObservation.observations = [];
  const item = (await getCycleSignups(database([noObservation]), actor, cycleId, url())).items[0];
  for (const key of ['observationId', 'observationRevision', 'recommendationGenerationId', 'recommendationsReleasedAt']) assert.equal(item[key], null);
  assert.deepEqual(item.proposedMeetings, []);
  const ungenerated = row(); ungenerated.observations[0].recommendationGenerationId = null;
  ungenerated.observations[0].recommendationsReleasedAt = null;
  const draft = (await getCycleSignups(database([ungenerated]), actor, cycleId, url())).items[0];
  assert.equal(draft.recommendationGenerationId, null); assert.equal(draft.recommendationsReleasedAt, null);
});

test('only the exact effective signups.read grant authorizes reads, regardless of roles or participation', async () => {
  for (const permissions of [[], ['signups.read.own', 'observations.read.own'], ['cycles.read', 'observations.read', 'test:admin']]) {
    await assert.rejects(getCycleSignups({ evaluationCycle: { findUnique: forbidden } },
      { ...actor, roles: ['Admin'], permissions }, cycleId, url()), e => e.status === 403);
  }
  assert.equal((await getCycleSignups(database([row()]), { ...actor, roles: [] }, cycleId, url())).items.length, 1);
});

test('malformed identifiers and pagination fail before reading the database', async () => {
  const db = { evaluationCycle: { findUnique: forbidden } };
  await assert.rejects(getCycleSignups(db, actor, 'not-a-uuid', url()), e => e.status === 422);
  for (const query of ['departmentId=bad', 'hiringLevelId=bad', 'cursor=bad', 'limit=0', 'limit=101', 'limit=1.5']) {
    await assert.rejects(getCycleSignups(db, actor, cycleId, url(query)), e => e.status === 422);
  }
  for (const query of ['userId=other', 'cycleId=' + id(8), 'limit=1&limit=2', 'q=', 'q=' + 'x'.repeat(201), 'cursor=']) {
    await assert.rejects(getCycleSignups(db, actor, cycleId, url(query)), e => e.status === 400);
  }
});

test('missing cycles and ambiguous observations produce explicit errors', async () => {
  const missing = database(); missing.evaluationCycle.findUnique = async () => null;
  missing.evaluationSignup.findMany = forbidden;
  await assert.rejects(getCycleSignups(missing, actor, cycleId, url()), e => e.status === 404);
  const ambiguous = row(); ambiguous.observations.push({ ...ambiguous.observations[0], observationId: id(20) });
  await assert.rejects(getCycleSignups(database([ambiguous]), actor, cycleId, url()), e => e.code === 'AMBIGUOUS_OBSERVATION');
});

test('pagination uses signup UUIDs and validates cursors under the requested cycle and filters', async () => {
  const db = database([row(3), row(4)]);
  const result = await getCycleSignups(db, actor, cycleId, url('limit=1'));
  assert.deepEqual(result.items.map(item => item.signupId), [id(3)]);
  assert.deepEqual(result.pageInfo, { nextCursor: id(3), hasMore: true });
  db.evaluationSignup.findFirst = async args => {
    assert.ok(args.where.AND.some(clause => clause.cycleId === cycleId));
    assert.ok(args.where.AND.some(clause => clause.professor?.departmentId === id(14)));
    assert.ok(args.where.AND.some(clause => clause.professor?.hiringLevelId === id(21)));
    return null;
  };
  db.evaluationSignup.findMany = forbidden;
  await assert.rejects(getCycleSignups(db, actor, cycleId,
    url(`cursor=${id(9)}&departmentId=${id(14)}&hiringLevelId=${id(21)}`)), e => e.code === 'INVALID_QUERY');
});

function route(db, authResult = actor, authFailure = false) {
  const source = readFileSync(new URL('../../src/app/api/evaluation-cycles/[cycleId]/signups/route.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const loaded = { exports: {} };
  const require = name => {
    if (name.endsWith('/permissions')) return { checkApiPermission: async permission => {
      assert.equal(permission, 'signups.read');
      if (authFailure) throw new Error('SECRET authentication dependency');
      return authResult;
    } };
    if (name.endsWith('/prisma')) return { getPrisma: () => { if (!db) forbidden(); return db; } };
    if (name.endsWith('/configuration-validation')) return { ConfigurationError };
    if (name.endsWith('/cycle-signups')) return { getCycleSignups };
    throw new Error(name);
  };
  new Function('require', 'module', 'exports', outputText)(require, loaded, loaded.exports);
  return (query = '', pathId = cycleId) => loaded.exports.GET(new Request(url(query)), { params: Promise.resolve({ cycleId: pathId }) });
}

test('HTTP boundary enforces authenticated permission checks before database access and always returns private errors', async () => {
  for (const status of [401, 403]) {
    const response = await route(null, new Response(null, { status }))();
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await response.json()).error.code, status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN');
  }
  for (const failure of [route(database(), actor, true), route({ evaluationCycle: { findUnique: async () => { throw new Error('SECRET SQL'); } } })]) {
    const response = await failure();
    assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.doesNotMatch(await response.text(), /SECRET/);
  }
});

test('HTTP route executes the authorized query for valid, empty, invalid and missing-cycle reads', async () => {
  const ok = await route(database([row()]))();
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'private, no-store');
  assert.equal((await ok.json()).items[0].proposedMeetings[0].id, id(18));
  assert.deepEqual((await (await route(database())()).json()).items, []);
  const invalid = await route(database())('', 'bad');
  assert.equal(invalid.status, 422); assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
  const missing = database(); missing.evaluationCycle.findUnique = async () => null;
  const response = await route(missing)();
  assert.equal(response.status, 404); assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
