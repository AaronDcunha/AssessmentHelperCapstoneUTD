import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import pg from 'pg';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const actorId = '11111111-1111-4111-8111-111111111111';
const observeeId = '22222222-2222-4222-8222-222222222222';
const sectionId = '33333333-3333-4333-8333-333333333333';
const user = { id: actorId, permissions: ['profile.read.own', 'observations.read.own', 'assessment.read.own', 'assessment.submit.own', 'assessment.acknowledge.own', 'signups.create.own', 'signups.read.own', 'course-sections.read.own', 'evaluation-status.read.own', 'invitations.respond.own'] };
const criteria = [{ id: 'rating', prompt: 'Required rating', type: 'RATING', min: 1, max: 5, required: true }, { id: 'text', prompt: 'Optional text', type: 'TEXT', min: null, max: null, required: false }];
const now = new Date('2026-10-19T12:00:00Z');
const cycle = { id: 'cycle', semesterId: 'semester', semester: 'Fall 2026', signupDeadline: '2026-10-31T12:00:00Z', observationDeadline: '2026-11-30T12:00:00Z' };
const dashboard = { asOf: now.toISOString(), hasFacultyProfile: true, cycle, currentObservation: { id: 'observation', scheduledAt: '2026-10-18T12:00:00Z' }, evaluation: { status: 'due', lastCompletedEvaluation: { semesterId: 'previous' } }, access: { observations: true } };

// Real services/queries execute; only auth and the SQL transport are substituted.
function runtime(db, identity = user, overrides = {}) {
  const cache = new Map();
  function load(filename) {
    const path = resolve(root, filename);
    if (cache.has(path)) return cache.get(path);
    const loaded = { exports: {} };
    function localRequire(name) {
      if (name === 'server-only') return {};
      if (name.endsWith('/db') || name === '../db') return { getPool: () => db };
      if (name.endsWith('/permissions')) return { getCurrentUser: async () => identity };
      if (name.endsWith('/faculty-dashboard')) return { getFacultyDashboard: async () => overrides.dashboard ?? dashboard };
      if (overrides.workflow && name.endsWith('/faculty-workflow')) return { getFacultyWorkflow: async () => typeof overrides.workflow === 'function' ? overrides.workflow() : overrides.workflow };
      if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
      const base = name.startsWith('@/') ? resolve(root, 'src', name.slice(2)) : resolve(dirname(path), name);
      return load(existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`);
    }
    const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
    new Function('require', 'module', 'exports', outputText)(localRequire, loaded, loaded.exports);
    cache.set(path, loaded.exports); return loaded.exports;
  }
  return load;
}

const meetings = [{ id: 'meeting', day: 'Monday', startTime: '10:00', endTime: '11:15', location: null }];
test('calendar derives only unambiguous future weekly meetings before the exclusive deadline, using Chicago dates', () => {
  const { proposedMeetingOptions, facultyDate, meetingForDate } = runtime({})('src/server/services/faculty-calendar.ts');
  assert.equal(facultyDate(new Date('2026-10-20T01:00:00Z')), '2026-10-19');
  assert.equal(facultyDate(new Date('2026-11-03T05:00:00Z')), '2026-11-02');
  assert.deepEqual(proposedMeetingOptions(meetings, now, new Date('2026-11-03T06:00:00Z')).map(option => option.date), ['2026-10-19', '2026-10-26', '2026-11-02']);
  assert.deepEqual(proposedMeetingOptions(meetings, new Date('2026-10-19T16:00:00Z'), new Date('2026-10-26T05:00:00Z')), []);
  assert.equal(meetingForDate('2026-02-30', meetings), null);
  assert.equal(meetingForDate('2026-10-19', [...meetings, { ...meetings[0], id: 'second' }]), null);
  assert.equal(meetingForDate('2026-10-19', [{ ...meetings[0], startTime: 'invalid' }]), null);
  assert.deepEqual(proposedMeetingOptions(meetings, now, new Date('2035-01-01')), []);
});

test('signup checks permission, deadline, existing signup and missing/first-semester eligibility without granting it from a rank', () => {
  const { signupBlockReason } = runtime({})('src/server/queries/faculty-workflow.ts');
  assert.equal(signupBlockReason(user, dashboard, false), '');
  assert.match(signupBlockReason({ ...user, permissions: [] }, dashboard, false), /permissions/);
  assert.match(signupBlockReason(user, { ...dashboard, evaluation: { status: 'unknown' } }, false), /review/);
  assert.match(signupBlockReason(user, { ...dashboard, evaluation: { status: 'notDue', lastCompletedEvaluation: { semesterId: cycle.semesterId } } }, false), /review/);
  assert.match(signupBlockReason(user, dashboard, true), /already/);
  assert.match(signupBlockReason(user, { ...dashboard, asOf: cycle.signupDeadline }, false), /deadline/);
});

test('course options and request reads bind account identity and current-cycle semester on the server', async () => {
  const calls = [];
  const db = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('FROM public.teaches t')) return { rows: [{ id: sectionId, label: 'Owned course', meetings }] };
    return { rows: [] };
  } };
  const { getFacultyWorkflow } = runtime(db, user, { dashboard: { ...dashboard, currentObservation: null } })('src/server/queries/faculty-workflow.ts');
  const result = await getFacultyWorkflow(user, { now });
  assert.equal(result.sections.length, 1); assert.ok(result.sections[0].options.length);
  assert.deepEqual(calls[0].values, [actorId, cycle.semesterId]);
  assert.match(calls[0].sql, /p.user_id = \$1 AND cs.semester_id = \$2/);
  const received = calls.find(call => call.sql.includes('FROM public.observation_candidate'));
  assert.deepEqual(received.values, [actorId, cycle.id, now]);
  assert.match(received.sql, /recipient.user_id = \$1/);
  assert.match(received.sql, /candidate.expires_at > \$3/);
  const restricted = await getFacultyWorkflow({ ...user, permissions: ['profile.read.own'] }, { now });
  assert.deepEqual(restricted.sections, []); assert.equal(restricted.existingSignup, null);
});

function assessmentDatabase() {
  const calls = [];
  let row = { observationId: 'observation', templateId: 'template', title: 'Stored template', description: null,
    course: 'TEST', section: '1', scheduledAt: new Date('2026-10-18T12:00:00Z'), observer: 'Observer fixture', observee: 'Observee fixture',
    criteria, responses: null, observerSignedAt: null, observeeSignedAt: null, locked: false };
  const db = { calls, async connect() { return db; }, release() {}, async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes('t.template_name AS title')) {
      if (![actorId, observeeId].includes(values[0])) return { rows: [] };
      return { rows: [{ ...row, participation: values[0] === actorId ? 'observer' : 'observee' }] };
    }
    if (sql.includes('INSERT INTO public.signed_assessment')) row = { ...row, responses: JSON.parse(values[3]), observerSignedAt: values[4], observeeSignedAt: values[5], locked: values[6] };
    return { rows: [], rowCount: 1 };
  } }; return db;
}

test('assessment validates actual criteria, required values and scale bounds; draft omissions are allowed', () => {
  const { validateAssessmentAnswers } = runtime({})('src/server/services/faculty-assessment.ts');
  assert.deepEqual(validateAssessmentAnswers(criteria, { answers: {}, comments: '' }, false).answers, {});
  for (const answers of [{}, { rating: 6 }, { rating: 2.5 }, { rating: '5' }, { rating: 3, foreign: 4 }]) assert.throws(() => validateAssessmentAnswers(criteria, { answers, comments: '' }, true));
  assert.throws(() => validateAssessmentAnswers([{ ...criteria[0], type: 'UNKNOWN' }], { answers: {}, comments: '' }, false));
  assert.equal(validateAssessmentAnswers(criteria, { answers: { rating: 4 }, comments: 'Stored comment' }, true).answers.rating, 4);
});

test('observer drafts persist; stale saves and observing faculty signing for the observee are rejected; separate acknowledgements lock atomically', async () => {
  const db = assessmentDatabase(), load = runtime(db);
  const read = load('src/server/queries/faculty-assessment.ts').getFacultyAssessment;
  const act = load('src/server/services/faculty-assessment.ts').saveFacultyAssessment;
  const initial = await read(user, { database: db });
  await assert.rejects(act({ ...user, id: observeeId }, { action: 'acknowledge', revision: initial.revision, acknowledged: true }), /not available/);
  const saved = await act(user, { action: 'save', revision: initial.revision, responses: { answers: { rating: 4 }, comments: 'Own draft' } });
  assert.equal(saved.form.responses.answers.rating, 4);
  await assert.rejects(act(user, { action: 'save', revision: initial.revision, responses: saved.form.responses }), /changed/);
  await assert.rejects(act(user, { action: 'acknowledge', revision: saved.form.revision, responses: saved.form.responses, acknowledged: true, role: 'observee' }), /Invalid/);
  const signed = await act(user, { action: 'acknowledge', revision: saved.form.revision, responses: saved.form.responses, acknowledged: true });
  assert.ok(signed.form.observerSignedAt); assert.equal(signed.form.observeeSignedAt, null); assert.equal(signed.form.canEdit, false); assert.equal(signed.form.locked, false);
  const observee = { ...user, id: observeeId, permissions: user.permissions.filter(permission => permission !== 'assessment.submit.own') };
  const review = await read(observee, { database: db });
  await assert.rejects(act(observee, { action: 'acknowledge', revision: review.revision, acknowledged: true, responses: review.responses }), /Only the observer/);
  const finalized = await act(observee, { action: 'acknowledge', revision: review.revision, acknowledged: true });
  assert.equal(finalized.form.locked, true); assert.ok(finalized.form.observeeSignedAt);
  assert.ok(db.calls.some(call => call.sql.includes("status = 'COMPLETED'")));
  await assert.rejects(act(user, { action: 'save', revision: finalized.form.revision, responses: review.responses }), /not available/);
  assert.equal(db.calls.filter(call => call.sql.includes('INSERT INTO public.notification')).length, 2);
  assert.ok(db.calls.some(call => call.sql.includes('FOR UPDATE OF o')));
  assert.ok(db.calls.some(call => call.sql === 'ROLLBACK'));
});

test('assessment rejects revoked access and a nonparticipant before any write', async () => {
  const db = assessmentDatabase();
  const { saveFacultyAssessment } = runtime(db)('src/server/services/faculty-assessment.ts');
  await assert.rejects(saveFacultyAssessment({ ...user, permissions: [] }, {}), /Forbidden/);
  assert.equal(db.calls.length, 0);
  await assert.rejects(saveFacultyAssessment({ ...user, id: sectionId }, { action: 'save', revision: 'spoof', responses: {} }), /required/);
  assert.ok(!db.calls.some(call => call.sql.includes('INSERT')));
});

test('signup input rejects injected identity, duplicate dates and empty selections before a connection', async () => {
  const { signupInput, submitFacultySignup } = runtime({})('src/server/services/faculty-actions.ts');
  for (const body of [{ sectionId, dates: [] }, { sectionId, dates: ['2026-10-19', '2026-10-19'] }, { sectionId, dates: ['2026-10-19'], professorId: actorId }, { sectionId: 'bad', dates: ['2026-10-19'] }]) assert.throws(() => signupInput(body));
  await assert.rejects(submitFacultySignup({ ...user, permissions: [] }, {}), /Forbidden/);
});

test('signup commits signup, observation and dates together, rechecks availability, and rolls back on a changed deadline or insert failure', async () => {
  const workspace = { dashboard, signup: { allowed: true, reason: '' }, sections: [{ id: sectionId, options: [{ date: '2026-10-26' }] }] };
  for (const scenario of ['success', 'unavailable-date', 'deadline-changed', 'insert-failed', 'duplicate']) {
    const calls = []; let reads = 0;
    const db = { async connect() { return db; }, release() {}, async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes('FROM public.professor WHERE user_id')) return { rows: [{ id: observeeId }] };
      if (sql.includes('INSERT INTO public.evaluation_signup') && scenario === 'duplicate') throw Object.assign(new Error('private duplicate error'), { code: '23505' });
      if (sql.includes('INSERT INTO public.observation (') && scenario === 'insert-failed') throw new Error('private insert error');
      return { rows: [], rowCount: 1 };
    } };
    const { submitFacultySignup } = runtime(db, user, { workflow: () => { reads++; return scenario === 'deadline-changed' && reads > 1 ? { ...workspace, signup: { allowed: false, reason: 'The signup deadline has passed.' } } : workspace; } })('src/server/services/faculty-actions.ts');
    const action = submitFacultySignup(user, { sectionId, dates: [scenario === 'unavailable-date' ? '2026-10-27' : '2026-10-26'] });
    if (scenario === 'success') {
      const result = await action; assert.ok(result.signupId); assert.ok(result.observationId);
      assert.equal(calls.filter(call => call.sql.includes('INSERT INTO')).length, 3);
      assert.equal(calls.at(-1).sql, 'COMMIT');
      const signup = calls.find(call => call.sql.includes('INSERT INTO public.evaluation_signup'));
      assert.equal(signup.values[2], observeeId); // Resolved professor UUID, never account/browser UUID.
      assert.equal(signup.values[3], sectionId);
    } else {
      await assert.rejects(action, scenario === 'duplicate' ? /already signed up/ : undefined);
      assert.equal(calls.at(-1).sql, 'ROLLBACK'); assert.ok(!calls.some(call => call.sql === 'COMMIT'));
      if (scenario === 'deadline-changed' || scenario === 'unavailable-date') assert.ok(!calls.some(call => call.sql.includes('INSERT INTO')));
    }
    assert.deepEqual(calls.find(call => call.sql.includes('FROM public.professor WHERE user_id')).values, [actorId]);
  }
});

test('decline is scoped to the invited account and active window; it commits notification with response or rolls back if changed', async () => {
  const candidateId = sectionId;
  for (const changed of [false, true]) {
    const calls = [];
    const db = { async connect() { return db; }, release() {}, async query(sql, values = []) {
      calls.push({ sql, values });
      return { rows: sql.includes('UPDATE public.observation_candidate') && !changed ? [{ recipient: observeeId }] : [] };
    } };
    const { declineFacultyRequest } = runtime(db, user, { workflow: { dashboard, requests: [{ id: candidateId }] } })('src/server/services/faculty-actions.ts');
    const action = declineFacultyRequest(user, { candidateId });
    if (changed) { await assert.rejects(action, /changed or expired/); assert.equal(calls.at(-1).sql, 'ROLLBACK'); }
    else { assert.match((await action).message, /declined/); assert.equal(calls.at(-1).sql, 'COMMIT'); assert.ok(calls.some(call => call.sql.includes('INSERT INTO public.notification'))); }
    const update = calls.find(call => call.sql.includes('UPDATE public.observation_candidate'));
    assert.deepEqual(update.values, [candidateId, actorId, cycle.id]);
    assert.match(update.sql, /recipient.user_id = \$2/); assert.match(update.sql, /candidate.expires_at > clock_timestamp\(\)/);
    assert.ok(calls.some(call => call.sql.includes('FOR UPDATE OF o, candidate')));
  }
});

test('action responses require login, same origin and JSON, expose no private exception, and always use no-store', async () => {
  for (const [identity, origin, contentType, body, expected] of [[null, 'http://localhost', 'application/json', '{}', 401], [user, 'https://other.example', 'application/json', '{}', 403], [user, 'http://localhost', 'text/plain', '{}', 415], [user, 'http://localhost', 'application/json', '{invalid', 400], [user, 'http://localhost', 'application/json', '{}', 503]]) {
    const { facultyActionResponse } = runtime({}, identity)('src/server/services/faculty-action-response.ts');
    const response = await facultyActionResponse(new Request('http://localhost/api/me/dashboard/signup', { method: 'POST', headers: { origin, 'content-type': contentType }, body }), async () => { throw new Error('private SQL error'); });
    assert.equal(response.status, expected); assert.match(response.headers.get('cache-control'), /no-store/); assert.ok(!(await response.text()).includes('private SQL'));
  }
  const { facultyActionResponse } = runtime({}, user)('src/server/services/faculty-action-response.ts');
  const request = origin => new Request('http://localhost:3107/api/me/dashboard/signup', { method: 'POST', headers: { host: '127.0.0.1:3107', origin, 'x-forwarded-proto': 'http', 'content-type': 'application/json' }, body: '{}' });
  assert.equal((await facultyActionResponse(request('http://127.0.0.1:3107'), async () => ({ ok: true }))).status, 200);
  for (const origin of ['http://127.0.0.1:3108', 'https://127.0.0.1:3107', 'https://other.example']) assert.equal((await facultyActionResponse(request(origin), async () => ({ ok: true }))).status, 403);
});

test('PostgreSQL can plan every workflow read, lock and mutation without executing writes', { skip: process.env.TEST_DATABASE_PLANS !== 'true' }, async () => {
  const db = assessmentDatabase(), original = db.query.bind(db);
  db.query = async (sql, values = []) => {
    if (sql.includes('FROM public.professor WHERE user_id') || sql.includes('UPDATE public.observation_candidate')) {
      db.calls.push({ sql, values });
      return { rows: sql.includes('UPDATE') ? [{ recipient: observeeId }] : [{ id: observeeId }], rowCount: 1 };
    }
    return original(sql, values);
  };
  const workspace = { dashboard, signup: { allowed: true, reason: '' }, sections: [{ id: sectionId, options: [{ date: '2026-10-26' }] }], requests: [{ id: sectionId }] };
  const load = runtime(db, user, { workflow: workspace });
  const { getFacultyAssessment } = load('src/server/queries/faculty-assessment.ts');
  const { saveFacultyAssessment } = load('src/server/services/faculty-assessment.ts');
  const { submitFacultySignup, declineFacultyRequest } = load('src/server/services/faculty-actions.ts');
  let form = await getFacultyAssessment(user, { database: db });
  form = (await saveFacultyAssessment(user, { action: 'acknowledge', revision: form.revision, acknowledged: true, responses: { answers: { rating: 4 }, comments: '' } })).form;
  const observee = { ...user, id: observeeId };
  form = await getFacultyAssessment(observee, { database: db });
  await saveFacultyAssessment(observee, { action: 'acknowledge', revision: form.revision, acknowledged: true });
  await submitFacultySignup(user, { sectionId, dates: ['2026-10-26'] });
  await declineFacultyRequest(user, { candidateId: sectionId });
  await runtime(db)('src/server/queries/faculty-workflow.ts').getFacultyWorkflow(user, { now });
  const url = new URL(process.env.DATABASE_URL); url.searchParams.delete('schema');
  const live = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  await live.connect();
  try {
    await live.query('BEGIN READ ONLY');
    const planned = new Set();
    for (const { sql, values } of db.calls) {
      if (!/^\s*(SELECT|INSERT|UPDATE)\b/i.test(sql) || planned.has(sql)) continue;
      planned.add(sql);
      const parameters = values.map(value => ['observation', 'template', 'cycle', 'semester', 'previous'].includes(value) ? '77777777-7777-4777-8777-777777777777' : value);
      await live.query(`EXPLAIN ${sql}`, parameters); // Never EXPLAIN ANALYZE: no mutation executes.
    }
    assert.ok(planned.size >= 14);
  } finally { await live.query('ROLLBACK'); await live.end(); }
});
