import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function runtime() {
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const loaded = { exports: {} }; cache.set(path, loaded);
    const local = name => {
      if (name === 'server-only') return {};
      if (!name.startsWith('.')) return require(name);
      const base = resolve(dirname(path), name);
      return load(existsSync(base) ? base : base + '.ts');
    };
    const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    new Function('require', 'module', 'exports', outputText)(local, loaded, loaded.exports);
    return loaded.exports;
  }
  return load(resolve('src/server/queries/late-acceptance.ts'));
}
const { getLateAcceptanceRequests, currentLateAcceptanceCycle, lateAcceptanceState } = runtime();
const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const now = new Date('2026-11-05T16:00:00Z');
const cycle = { cycleId: id(1), observationDeadline: new Date('2026-11-30T23:00:00Z'), semester: { termName: 'Configured semester', startsOn: new Date('2026-08-01'), endsOn: new Date('2026-12-31'), timeZone: 'America/Chicago' } };
const reviewer = { permissions: ['late-acceptance.review'] };
function row(n) {
  const attempt = { attemptId: id(1000+n), expiresAt: new Date('2026-11-01'), status: 'EXPIRED', candidate: {
    status: 'EXPIRED', recommendationListId: id(2), attempts: [{ attemptId: id(1000+n) }],
    professor: { user: { userId: id(5000+n), fullName: n % 2 ? 'Observer Alpha' : 'Observer Beta' } },
    observation: { cycleId: id(1), cycle, status: 'PENDING', currentReleasedListId: id(2), currentReleasedList: { publishedAt: new Date('2026-10-01') },
      timeOptions: [], signup: { professor: { user: { userId: id(3), fullName: 'Observee Alpha' } }, section: { sectionId: id(4), sectionCode: '007', course: { courseCode: 'ACTUAL' }, classMeetings: [] } } },
  } };
  return { approvalId: id(n), status: n % 3 === 0 ? 'APPROVED' : 'PENDING', reason: '<saved reason>', attempt, requestedAt: new Date('2026-11-02') };
}
function db(rows, cycles = [cycle]) { return { evaluationCycle: { findMany: async () => cycles, findUnique: async () => cycles[0] }, lateAcceptanceApproval: { findMany: async () => rows } }; }
const url = query => new URL(`http://localhost/api?${query}`);

test('combined observer-only search and status apply before pagination, with full cycle counts', async () => {
  const rows = Array.from({ length: 145 }, (_, i) => row(145-i));
  const conn = db(rows), found = [];
  let cursor = '';
  do {
    const result = await getLateAcceptanceRequests(conn, reviewer, 'current', url(`search=alpha&status=pending&limit=7${cursor ? '&cursor='+cursor : ''}`), now);
    found.push(...result.items);
    assert.equal(result.summary.total, 145); assert.equal(result.summary.approved, 48);
    assert.equal(result.summary.pending, 97);
    cursor = result.pageInfo.nextCursor;
  } while (cursor);
  assert.equal(found.length, rows.filter(r => r.status === 'PENDING' && r.attempt.candidate.professor.user.fullName.includes('Alpha')).length);
  assert.equal(new Set(found.map(r => r.id)).size, found.length);
  const observee = await getLateAcceptanceRequests(conn, reviewer, 'current', url('search=Observee'), now);
  assert.equal(observee.items.length, 0);
  assert.equal(found[0].reason, '<saved reason>'); assert.equal(found[0].actionReason, null);
});

test('exact current-cycle lookup ignores list filters and first page without exposing another cycle', async () => {
  const rows = Array.from({ length: 120 }, (_, i) => row(i+1));
  const result = await getLateAcceptanceRequests(db(rows), reviewer, 'current', url(`requestId=${id(119)}&status=approved&search=absent`), now);
  assert.deepEqual(result.items.map(r => r.id), [id(119)]);
  await assert.rejects(getLateAcceptanceRequests(db(rows), reviewer, 'current', url(`requestId=${id(999)}`), now), e => e.status === 404);
});

test('current cycle uses inclusive semester dates in its time zone and rejects missing/overlapping matches', async () => {
  assert.equal((await currentLateAcceptanceCycle(db([]), now)).cycleId, cycle.cycleId);
  for (const cycles of [[], [cycle, { ...cycle, cycleId: id(8) }], [{ ...cycle, semester: { ...cycle.semester, startsOn: null } }]]) {
    const conn = db([], cycles); conn.lateAcceptanceApproval.findMany = () => { throw Error('Must not query requests'); };
    const result = await getLateAcceptanceRequests(conn, reviewer, 'current', url(''), now);
    assert.equal(result.cycle, null);
  }
  const boundary = { ...cycle, semester: { ...cycle.semester, startsOn: new Date('2026-11-05'), endsOn: new Date('2026-11-05') } };
  assert.ok(await currentLateAcceptanceCycle(db([], [boundary]), new Date('2026-11-06T05:59:00Z')));
  assert.equal(await currentLateAcceptanceCycle(db([], [boundary]), new Date('2026-11-06T06:01:00Z')), null);
});

test('permission and input validation fail explicitly before request reads', async () => {
  await assert.rejects(getLateAcceptanceRequests({}, { permissions: [] }, 'current', url(''), now), e => e.status === 403);
  for (const query of ['status=unknown', 'limit=0', 'cursor=bad', 'requestId=bad', 'search='+ 'a'.repeat(201), 'search=%00', 'search=%0a', 'search='+ encodeURIComponent(' '.repeat(201))]) {
    await assert.rejects(getLateAcceptanceRequests(db([]), reviewer, 'current', url(query), now), e => [400,422].includes(e.status));
  }
});

test('derived reasons remain distinct from decisions; original attempt expiry survives reopening', async () => {
  for (const [kind, code] of [['observer', 'OBSERVER_CONFIRMED'], ['deadline', 'DEADLINE_PASSED'], ['closed', 'OBSERVATION_CLOSED'], ['attempt', 'SUPERSEDED'], ['list', 'SUPERSEDED'], ['answered', 'ANSWERED']]) {
    const r = row(1), c = r.attempt.candidate, o = c.observation;
    o.cycle = { ...cycle };
    if (kind === 'observer') o.observerId = id(8);
    if (kind === 'deadline') o.cycle.observationDeadline = now;
    if (kind === 'closed') o.status = 'CANCELLED';
    if (kind === 'attempt') c.attempts = [{ attemptId: id(99) }];
    if (kind === 'list') c.recommendationListId = id(99);
    if (kind === 'answered') c.respondedAt = now;
    assert.equal(lateAcceptanceState(r, now).reasonCode, code);
    const result = await getLateAcceptanceRequests(db([r]), reviewer, 'current', url('status=notActionable'), now);
    assert.equal(result.items[0].status, 'PENDING'); assert.equal(result.summary.notActionable, 1);
  }
  const r = row(3); r.attempt.candidate.attempts = [{ attemptId: id(9999), expiresAt: new Date('2026-11-07') }];
  const result = await getLateAcceptanceRequests(db([r]), reviewer, 'current', url(''), now);
  assert.equal(result.items[0].displayStatus, 'APPROVED');
  assert.equal(result.items[0].originalInvitationExpiresAt, '2026-11-01T00:00:00.000Z');
});
