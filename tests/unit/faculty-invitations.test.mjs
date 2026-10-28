import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const id = number => `${String(number).padStart(8, '0')}-1111-4111-8111-111111111111`;
const user = { id: id(1), permissions: ['profile.read.own', 'observations.read.own', 'invitations.respond.own', 'recommendations.release'] };

// Execute the actual services, replacing only the persistence boundary.
function runtime(db) {
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const loaded = { exports: {} };
    cache.set(path, loaded);
    const localRequire = name => {
      if (name === 'server-only') return {};
      if (name.endsWith('/prisma')) return { getPrisma: () => ({ $transaction: async (action, options) => {
        assert.equal(options.isolationLevel, 'Serializable');
        return action(db);
      } }) };
      if (name.endsWith('/admin-validation') || name.endsWith('/queries/admin')) return {};
      if (!name.startsWith('.')) return require(name);
      const base = resolve(dirname(path), name);
      return load(existsSync(base) ? base : `${base}.ts`);
    };
    const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
    new Function('require', 'module', 'exports', outputText)(localRequire, loaded, loaded.exports);
    return loaded.exports;
  }
  return load(resolve(root, 'src/server/services/faculty-invitations.ts'));
}

function fixture() {
  const writes = [];
  const record = { observationId: id(2), status: 'PENDING', workflowRevision: 0, cycle: { observationDeadline: new Date('2099-01-01') }, signup: { professor: { userId: id(9) } } };
  const candidate = { candidateId: id(3), observationId: record.observationId, professor: { userId: user.id }, status: 'PENDING' };
  const attempt = { attemptId: id(4), status: 'PENDING', invitedAt: new Date('2000-01-01'), expiresAt: new Date('2099-01-01') };
  const write = name => async input => { writes.push({ name, input }); return { count: 1 }; };
  const db = {
    observation: { findUnique: async () => record, findMany: async () => [record], updateMany: write('revision'), update: write('observation') },
    observationCandidate: { findUnique: async () => candidate, update: write('candidate') },
    invitationAttempt: { findFirst: async () => attempt, update: write('attempt') },
    notification: { upsert: async input => { writes.push({ name: 'notification', input: { data: input.create } }); return input.create; } },
  };
  return { db, record, candidate, attempt, writes };
}

test('Faculty mutation grants are required before opening a transaction', async () => {
  const actions = runtime({});
  for (const name of ['generateRecommendations', 'releaseRecommendations', 'sendFacultyInvitations', 'acceptFacultyInvitation', 'declineFacultyInvitation', 'selectFacultyObserver', 'requestLateAcceptance', 'reviewLateAcceptance']) {
    await assert.rejects(actions[name]({ id: user.id, permissions: [] }, {}), error => error.status === 403, name);
  }
});

test('invitation responses reject another account, superseded attempts and expired windows', async () => {
  for (const kind of ['owner', 'superseded', 'expired']) {
    const f = fixture();
    if (kind === 'owner') f.candidate.professor.userId = id(8);
    if (kind === 'superseded') f.attempt.attemptId = id(8);
    if (kind === 'expired') f.attempt.expiresAt = new Date('2000-01-02');
    const actions = runtime(f.db);
    for (const name of ['declineFacultyInvitation', 'acceptFacultyInvitation']) {
      await assert.rejects(actions[name](user, { candidateId: id(3), attemptId: id(4), ...(name.startsWith('accept') ? { meetingOptionId: id(5) } : {}) }), error => error.status === (kind === 'owner' ? 403 : 409));
    }
    assert.equal(f.writes.some(write => ['candidate', 'attempt', 'notification'].includes(write.name)), false);
  }
});

test('decline records candidate and current attempt together and notifies the observee', async () => {
  const f = fixture();
  await runtime(f.db).declineFacultyInvitation(user, { candidateId: id(3), attemptId: id(4) });
  assert.deepEqual(f.writes.map(write => write.name), ['revision', 'candidate', 'attempt', 'notification']);
  assert.equal(f.writes[1].input.data.status, 'DECLINED');
  assert.equal(f.writes[2].input.data.status, 'DECLINED');
  assert.equal(f.writes[3].input.data.userId, id(9));
});

test('release validates the generation selection and retry avoids duplicate notifications', async () => {
  const f = fixture();
  const actions = runtime(f.db);
  const body = { generationId: id(6), observationIds: [id(2)] };
  await actions.releaseRecommendations(user, id(7), body);
  assert.equal(f.writes.filter(write => write.name === 'notification').length, 1);
  f.record.recommendationsReleasedAt = new Date();
  await actions.releaseRecommendations(user, id(7), body);
  assert.equal(f.writes.filter(write => write.name === 'notification').length, 1);
  f.db.observation.findMany = async () => [];
  await assert.rejects(actions.releaseRecommendations(user, id(7), body), error => error.status === 404);
});
