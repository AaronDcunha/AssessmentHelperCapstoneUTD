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
function runtime(db, notifications) {
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const loaded = { exports: {} };
    cache.set(path, loaded);
    const localRequire = name => {
      if (name === 'server-only') return {};
      if (notifications && name.endsWith('/notification-delivery')) return { sendNotification: async input => { notifications.push(input); } };
      if (name.endsWith('/prisma')) return { getPrisma: () => ({ ...db, $transaction: async (action, options) => {
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
  const list = { listId: id(8), generationId: id(6), publishedAt: new Date('2000-01-01') };
  const record = { observationId: id(2), status: 'PENDING', workflowRevision: 0, currentReleasedListId: list.listId, currentReleasedList: list, currentDraftListId: null, cycle: { observationDeadline: new Date('2099-01-01') }, signup: { professor: { userId: id(9) } } };
  const candidate = { candidateId: id(3), observationId: record.observationId, recommendationListId: list.listId, professor: { userId: user.id }, status: 'PENDING' };
  const attempt = { attemptId: id(4), status: 'PENDING', invitedAt: new Date('2000-01-01'), expiresAt: new Date('2099-01-01') };
  const write = name => async input => { writes.push({ name, input }); return { count: 1 }; };
  const db = {
    appUser: { findMany: async ({where}) => {
      assert.equal(where.isActive,true);
      return where.OR.flatMap(clause=>(clause.userId?.in??[]).map(userId=>({userId,userRoles:[]})));
    } },
    observation: { findUnique: async () => record, findMany: async () => [record], updateMany: write('revision'), update: write('observation') },
    recommendationList: { findFirst: async () => null, update: write('list') },
    observationCandidate: { findUnique: async () => candidate, findFirst: async () => null, update: write('candidate') },
    invitationAttempt: { findFirst: async () => attempt, update: write('attempt') },
    notification: { upsert: async input => { writes.push({ name: 'notification', input: { data: input.create } }); return {notificationId:id(5),...input.create}; } },
  };
  return { db, record, candidate, attempt, writes };
}

test('Faculty mutation grants are required before opening a transaction', async () => {
  const actions = runtime({});
  for (const name of ['generateRecommendations', 'regenerateRecommendations', 'releaseRecommendations', 'sendFacultyInvitations', 'acceptFacultyInvitation', 'declineFacultyInvitation', 'selectFacultyObserver', 'requestLateAcceptance', 'reviewLateAcceptance']) {
    await assert.rejects(actions[name]({ id: user.id, permissions: [] }, {}), error => error.status === 403, name);
  }
});

test('selected generation filters by cycle and observation and rejects unavailable selections before writes', async () => {
  const actor = { ...user, permissions: ['recommendations.generate'] };
  let queried = false;
  const db = {
    evaluationCycle: { findUnique: async () => ({ signupDeadline: new Date('2000-01-01'), observationDeadline: new Date('2099-01-01') }) },
    observation: { findMany: async ({ where }) => {
      queried = true;
      assert.equal(where.cycleId, id(7));
      assert.deepEqual(where.observationId, { in: [id(2)] });
      assert.equal(where.recommendationsReleasedAt, null);
      assert.equal(where.observerId, null);
      assert.equal(where.status, 'PENDING');
      return [];
    } },
  };
  await assert.rejects(runtime(db).generateRecommendations(actor, id(7), { scope: { observationIds: [id(2)] } }), error => error.status === 409);
  assert.equal(queried, true);
  for (const observationIds of [[], ['invalid'], Array(501).fill(id(2))]) {
    await assert.rejects(runtime({}).generateRecommendations(actor, id(7), { scope: { observationIds } }), error => error.status === 400);
  }
});

test('generation remains unavailable while signup is open', async () => {
  const db = { evaluationCycle: { findUnique: async () => ({ signupDeadline: new Date('2098-01-01'), observationDeadline: new Date('2099-01-01') }) } };
  await assert.rejects(runtime(db).generateRecommendations({ ...user, permissions: ['recommendations.generate'] }, id(7), { scope: { observationIds: [id(2)] } }), /after signup closes/);
});

test('selected generation updates only the selected observation', async () => {
  const f = fixture();
  const notifications = [];
  f.record.signup.professor.user = { fullName: 'Sarah Mitchell' };
  f.record.signup.professorId = id(9);
  f.record.timeOptions = [];
  f.db.evaluationCycle = { findUnique: async () => ({ signupDeadline: new Date('2000-01-01'), observationDeadline: new Date('2099-01-01') }) };
  f.db.observation.findMany = async ({where}) => {
    assert.deepEqual(where.observationId.in, [id(2)]);
    return [f.record];
  };
  f.db.evaluationSignup = { findMany: async () => [] };
  f.db.recommendationList.create = async ({data}) => { assert.equal(data.observationId, id(2)); return {listId:id(80)}; };
  f.db.observationCandidate.deleteMany = async () => assert.fail('Generation must preserve historical members');
  f.db.appUser.findMany = async () => [];
  f.db.role = { findMany: async () => [] };
  const result = await runtime(f.db, notifications).generateRecommendations({ ...user, permissions: ['recommendations.generate'] }, id(7), { scope: { observationIds: [id(2)] } });
  assert.equal(result.generatedCount, 0);
  assert.equal(f.writes.filter(write => write.name === 'observation').length, 1);
  assert.equal(f.writes.find(write => write.name === 'observation').input.where.observationId, id(2));
  assert.equal(f.writes.find(write => write.name === 'observation').input.data.recommendationGenerationId, result.generationId);
  assert.equal(f.writes.find(write => write.name === 'observation').input.data.currentDraftListId, id(80));
  assert.equal(notifications[0].message, 'Sarah Mitchell has 0 compatible candidates for their observation.');
  assert.equal(notifications[0].observationId, id(2));
  assert.equal(notifications[0].message.includes(id(2)), false);
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
  f.record.currentDraftList = { ...f.record.currentReleasedList, publishedAt: null };
  f.record.currentDraftListId = id(8); f.record.currentReleasedListId = null; f.record.currentReleasedList = null;
  const actions = runtime(f.db);
  const body = { generationId: id(6), observationIds: [id(2)] };
  await actions.releaseRecommendations(user, id(7), body);
  assert.equal(f.writes.filter(write => write.name === 'notification').length, 1);
  f.record.recommendationsReleasedAt = new Date();
  f.record.currentReleasedListId = id(8); f.record.currentReleasedList = { ...f.record.currentDraftList, publishedAt: new Date() };
  f.record.currentDraftListId = null; f.record.currentDraftList = null;
  await actions.releaseRecommendations(user, id(7), body);
  assert.equal(f.writes.filter(write => write.name === 'notification').length, 1);
  f.db.observation.findMany = async () => [];
  await assert.rejects(actions.releaseRecommendations(user, id(7), body), error => error.status === 404);
});

test('every invitation/selection/approval mutation rejects draft, historical and unpublished membership', async () => {
  const actor = { ...user, permissions: [...user.permissions, 'invitations.send.own', 'recommendations.read.released.own', 'observer.select.own', 'late-acceptance.request.own', 'late-acceptance.review'] };
  for (const kind of ['draft', 'historical', 'unpublished', 'no-pointer']) {
    for (const [name, body] of [
      ['sendFacultyInvitations', { observationId: id(2), candidateIds: [id(3)] }],
      ['acceptFacultyInvitation', { candidateId: id(3), attemptId: id(4), meetingOptionId: id(5) }],
      ['declineFacultyInvitation', { candidateId: id(3), attemptId: id(4) }],
      ['selectFacultyObserver', { candidateId: id(3) }],
      ['requestLateAcceptance', { candidateId: id(3), attemptId: id(4) }],
      ['reviewLateAcceptance', { decision: 'approved' }],
    ]) {
      const f = fixture(); f.record.signup.professor.userId = actor.id;
      if (kind === 'draft' || kind === 'historical') f.candidate.recommendationListId = id(80);
      if (kind === 'unpublished') f.record.currentReleasedList.publishedAt = null;
      if (kind === 'no-pointer') f.record.currentReleasedListId = null;
      f.db.lateAcceptanceApproval = { findUnique: async () => ({ attempt: { candidate: f.candidate } }) };
      const actions = runtime(f.db);
      await assert.rejects(name === 'reviewLateAcceptance' ? actions[name](actor, id(70), body) : actions[name](actor, body), error => error.status === 409, `${kind}: ${name}`);
      assert.equal(f.writes.some(write => ['candidate', 'attempt', 'notification', 'observation'].includes(write.name)), false);
    }
  }
});

test('release refuses replacement, selected/form-started observations and imported drafts with invitation history', async () => {
  for (const kind of ['replacement', 'selected', 'assessment', 'contacted-import']) {
    const f = fixture();
    f.record.currentDraftListId = id(80);
    f.record.currentDraftList = { listId: id(80), generationId: id(6), publishedAt: null };
    if (kind !== 'replacement') { f.record.currentReleasedListId = null; f.record.currentReleasedList = null; }
    if (kind === 'selected') f.record.observerId = id(20);
    if (kind === 'assessment') f.record.signedAssessment = { isLocked: false };
    if (kind === 'contacted-import') f.db.observationCandidate.findFirst = async () => ({ candidateId: id(3) });
    await assert.rejects(runtime(f.db).releaseRecommendations(user, id(7), { generationId: id(6) }), error => error.status === 409);
    assert.deepEqual(f.writes, []);
  }
});

test('selection cannot attach a new observer to an existing unsigned or partially signed assessment', async () => {
  for (const observerSignedAt of [null, new Date()]) {
    const f = fixture();
    f.record.signup.professor.userId = user.id;
    f.record.signedAssessment = { isLocked: false, observerSignedAt };
    f.candidate.status = 'ACCEPTED'; f.candidate.acceptedOptionId = id(5);
    await assert.rejects(runtime(f.db).selectFacultyObserver({ ...user, permissions: [...user.permissions, 'observer.select.own'] }, { candidateId: f.candidate.candidateId }), error => error.status === 409);
    assert.equal(f.writes.some(write => ['candidate', 'observation', 'notification'].includes(write.name)), false);
  }
});


test('regeneration after selection only writes a draft and retries replay the committed receipt', async () => {
  const f = fixture(), receipts = new Map(), messages = [];
  f.record.cycle.signupDeadline = new Date('2000-01-01');
  f.record.cycleId = id(7); f.record.observerId = id(40); f.record.status = 'CONFIRMED';
  f.record.signup.professor.user = { fullName:'Observee' };
  f.db.recommendationOperation = { findUnique:async({where})=>receipts.get(where.requestKey)??null, create:async({data})=>{receipts.set(data.requestKey,data);return data;} };
  f.db.recommendationList.create = async () => ({listId:id(80)});
  f.db.evaluationSignup = {findMany:async()=>[]};
  const actor={...user,permissions:['recommendations.regenerate']},body={requestKey:id(81),expectedRevision:0};
  const actions=runtime(f.db,messages);
  const first=await actions.regenerateRecommendations(actor,id(2),body), count=f.writes.length;
  assert.equal(first.listId,id(80));assert.equal(first.revision,1);
  assert.deepEqual(await actions.regenerateRecommendations(actor,id(2),body),first);
  assert.equal(f.writes.length,count);assert.equal(messages.length,1);
  assert.equal(f.record.observerId,id(40));
  assert.deepEqual(Object.keys(f.writes.find(w=>w.name==='observation').input.data).sort(),['currentDraftListId','recommendationGenerationId']);
  assert.equal(f.writes.some(w=>['candidate','attempt'].includes(w.name)),false);
  await assert.rejects(actions.regenerateRecommendations(actor,id(2),{...body,reason:'Different'}),error=>error.status===409);
});

test('regeneration validation, stale revisions and assessment/closed-state guards reject before mutations', async () => {
  for(const state of ['stale','assessment','partially-signed','COMPLETED','CANCELLED','NOT_OCCURRED']){
    const f=fixture(); f.record.cycle.signupDeadline=new Date('2000-01-01');
    f.db.recommendationOperation={findUnique:async()=>null};
    if(state==='assessment'||state==='partially-signed')f.record.signedAssessment={isLocked:false,observerSignedAt:state==='partially-signed'?new Date():null};
    else if(state!=='stale')f.record.status=state;
    await assert.rejects(runtime(f.db).regenerateRecommendations({...user,permissions:['recommendations.regenerate']},id(2),{requestKey:id(80),expectedRevision:state==='stale'?1:0}),error=>error.status===409);
    assert.deepEqual(f.writes,[]);
  }
  const actions=runtime({});
  await assert.rejects(actions.regenerateRecommendations({...user,permissions:['recommendations.regenerate']},id(2),{expectedRevision:-1,requestKey:id(80)}),error=>error.status===400);
  await assert.rejects(actions.releaseRecommendations(user,id(7),{requestKey:id(80),targets:[{observationId:id(2),listId:id(8),expectedRevision:0},{observationId:id(2),listId:id(9),expectedRevision:0}]}),error=>error.status===400);
});
