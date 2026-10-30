import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const actorId = '11111111-1111-4111-8111-111111111111';
const observeeId = '22222222-2222-4222-8222-222222222222';
const sectionId = '33333333-3333-4333-8333-333333333333';
const user = { id: actorId, permissions: ['profile.read.own', 'observations.read.own', 'assessment.read.own', 'assessment.submit.own', 'assessment.acknowledge.own', 'signups.create.own', 'signups.read.own', 'course-sections.read.own', 'evaluation-status.read.own', 'invitations.respond.own'] };
const criteria = [{ id: 'rating', prompt: 'Required rating', type: 'RATING', min: 1, max: 5, required: true, options: [1, 2, 3, 4, 5].map(value => ({ value, label: String(value) })) }, { id: 'text', prompt: 'Optional text', type: 'TEXT', min: null, max: null, required: false, options: null }];
const now = new Date('2026-10-19T12:00:00Z');
const cycle = { id: 'cycle', semesterId: 'semester', semester: 'Fall 2026', startsOn: '2026-08-20', endsOn: '2026-12-20', timeZone: 'America/Chicago', signupDeadline: '2026-10-31T12:00:00Z', observationDeadline: '2026-11-30T12:00:00Z' };
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
      if (name.endsWith('/faculty-links')) return { getFacultyLinks: async () => ({ recommendations: [], requests: [], feedback: [] }) };
      if (name.endsWith('/prisma')) return { getPrisma: () => db };
      if (name.endsWith('/faculty-context')) return { selectedFacultyObservation: async () => null };
      if (name.endsWith('/notification-delivery')) return { sendNotification: async input => { db.calls?.push({ notification: input }); } };
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
test('persisted meeting instants reject DST gaps and ambiguous repeated times', () => {
  const { localMeetingInstant } = runtime({})('src/server/services/faculty-meetings.ts');
  assert.equal(localMeetingInstant('2026-03-08', '02:30', 'America/Chicago'), null);
  assert.equal(localMeetingInstant('2026-11-01', '01:30', 'America/Chicago'), null);
  assert.equal(localMeetingInstant('2026-03-08', '03:30', 'America/Chicago').toISOString(), '2026-03-08T08:30:00.000Z');
});
test('calendar respects configured bounds, missing settings, local dates and daylight-saving time', () => {
  const { proposedMeetingOptions } = runtime({})('src/server/services/faculty-calendar.ts');
  const options = settings => proposedMeetingOptions(meetings, now, new Date(cycle.observationDeadline), { ...cycle, ...settings }).map(option => option.date);
  assert.deepEqual(options({ startsOn: '2026-10-26', endsOn: '2026-11-02' }), ['2026-10-26', '2026-11-02']);
  assert.deepEqual(options({ startsOn: null }), []);
  assert.deepEqual(options({ endsOn: null }), []);
  assert.deepEqual(options({ startsOn: '2026-11-03', endsOn: '2026-11-02' }), []);
  const local = [{ ...meetings[0], startTime: '01:00', endTime: '02:00' }];
  const boundary = new Date('2026-10-19T06:30:00Z');
  const deadline = new Date('2026-10-20T12:00:00Z');
  assert.deepEqual(proposedMeetingOptions(local, boundary, deadline, cycle), []); // Already started in Chicago.
  assert.deepEqual(proposedMeetingOptions(local, boundary, deadline, { ...cycle, timeZone: 'America/Los_Angeles' }).map(option => option.date), ['2026-10-19']);
  assert.deepEqual(proposedMeetingOptions(local, new Date('2026-11-02T05:30:00Z'), new Date('2026-11-03T12:00:00Z'), cycle).map(option => option.date), ['2026-11-02']);
});
test('calendar derives only unambiguous future weekly meetings before the exclusive deadline, using Chicago dates', () => {
  const { proposedMeetingOptions, facultyDate, meetingForDate } = runtime({})('src/server/services/faculty-calendar.ts');
  assert.equal(facultyDate(new Date('2026-10-20T01:00:00Z')), '2026-10-19');
  assert.equal(facultyDate(new Date('2026-11-03T05:00:00Z')), '2026-11-02');
  assert.deepEqual(proposedMeetingOptions(meetings, now, new Date('2026-11-03T06:00:00Z'), cycle).map(option => option.date), ['2026-10-19', '2026-10-26', '2026-11-02']);
  assert.deepEqual(proposedMeetingOptions(meetings, new Date('2026-10-19T16:00:00Z'), new Date('2026-10-26T05:00:00Z'), cycle), []);
  assert.equal(meetingForDate('2026-02-30', meetings), null);
  assert.equal(meetingForDate('2026-10-19', [...meetings, { ...meetings[0], id: 'second' }]), null);
  assert.equal(meetingForDate('2026-10-19', [{ ...meetings[0], startTime: 'invalid' }]), null);
  assert.deepEqual(proposedMeetingOptions(meetings, now, new Date('2035-01-01'), cycle), []);
});

test('signup checks permission, deadline, existing signup and missing/first-semester eligibility without granting it from a rank', () => {
  const { signupBlockReason } = runtime({})('src/server/queries/faculty-workflow.ts');
  assert.equal(signupBlockReason(user, dashboard, false), '');
  assert.match(signupBlockReason({ ...user, permissions: [] }, dashboard, false), /permissions/);
  assert.match(signupBlockReason(user, { ...dashboard, evaluation: { status: 'unknown' } }, false), /review/);
  assert.match(signupBlockReason(user, { ...dashboard, evaluation: { status: 'notDue', lastCompletedEvaluation: { semesterId: cycle.semesterId } } }, false), /review/);
  assert.match(signupBlockReason(user, dashboard, true), /already/);
  assert.match(signupBlockReason(user, { ...dashboard, asOf: cycle.signupDeadline }, false), /deadline/);
  assert.match(signupBlockReason(user, { ...dashboard, cycle: { ...cycle, startsOn: null } }, false), /Semester dates/);
});

test('course options bind account identity and current-cycle semester through Prisma', async () => {
  let assignment;
  const db = { teaches: { findMany: async args => { assignment = args; return [{ section: { sectionId, sectionCode: '1', course: { courseCode: 'TEST', courseTitle: 'Owned course' }, classMeetings: meetings.map(m => ({ ...m, meetingId: m.id, dayOfWeek: m.day })) } }]; } }, evaluationSignup: { findFirst: async () => null } };
  const read = runtime(db, user, { dashboard: { ...dashboard, currentObservation: null } })('src/server/queries/faculty-workflow.ts').getFacultyWorkflow;
  const result = await read(user, { now }); assert.equal(result.sections.length, 1); assert.ok(result.sections[0].options.length);
  assert.deepEqual(assignment.where, { professor: { userId: actorId }, section: { semesterId: cycle.semesterId } });
  assert.deepEqual((await read({ ...user, permissions: ['profile.read.own'] }, { now })).sections, []);
});

function assessmentDatabase(overrides = {}) {
  const calls = [];
  let row = { observationId: 'observation', templateId: 'template', title: 'Stored template', description: null, templateRevision: 0, commentPrompts: [], signatureLabels: { observer: 'Observer', observee: 'Observee' }, timeZone: cycle.timeZone, course: 'TEST', section: '1', scheduledAt: new Date('2026-10-18T12:00:00Z'), observer: 'Observer fixture', observee: 'Observee fixture', criteria, responses: null, observerSignedAt: null, observeeSignedAt: null, locked: false, ...overrides };
  const record = () => ({ observationId: row.observationId, workflowRevision: 0, scheduledAt: row.scheduledAt, status: row.locked ? 'COMPLETED' : 'CONFIRMED', cycle: { observationDeadline: new Date('2099-01-01') }, observerId: 'observer-profile', observer: { userId: actorId, user: { fullName: row.observer } }, signup: { professor: { userId: observeeId, user: { fullName: row.observee } }, section: { sectionCode: row.section, course: { courseCode: row.course }, semester: { timeZone: row.timeZone } } }, signedAssessment: row.responses ? { assessmentId: 'saved', templateId: row.templateId, responses: row.responses, observerSignedAt: row.observerSignedAt, observeeSignedAt: row.observeeSignedAt, isLocked: row.locked } : null });
  const template = args => { calls.push({ template: args }); return { templateId: row.templateId, templateName: row.title, description: row.description, revision: row.templateRevision, commentPrompts: row.commentPrompts, signatureLabels: row.signatureLabels, status: 'published', criteria: row.criteria.map(c => ({ criterionId: c.id, criterionText: c.prompt, questionType: c.type, minRating: c.min, maxRating: c.max, isRequired: c.required, options: c.options })) }; };
  const write = async ({ data }) => { calls.push({ assessment: data }); row = { ...row, responses: data.responses, observerSignedAt: data.observerSignedAt, observeeSignedAt: data.observeeSignedAt, locked: data.isLocked }; return { count: 1 }; };
  const db = { calls, changeTemplate(changes) { row = { ...row, ...changes }; }, $transaction: async (run, options) => { assert.equal(options.isolationLevel, 'Serializable'); calls.push({ transaction: true }); try { return await run(db); } catch (error) { calls.push({ rollback: true }); throw error; } }, observation: { findFirst: async args => [actorId, observeeId].includes(args.where.OR[0].signup.professor.userId) ? record() : null, findUnique: async () => record(), updateMany: async () => { calls.push({ touch: true }); return { count: 1 }; }, update: async ({data}) => { calls.push({ observation: data }); } }, observationTemplate: { findFirst: async args => template(args), findUnique: async args => template(args) }, signedAssessment: { create: write, updateMany: write }, professor: { findUniqueOrThrow: async () => ({ userId: actorId }) } };
  return db;
}

test('assessment validates actual criteria, required values and scale bounds; draft omissions are allowed', () => {
  const { validateAssessmentAnswers } = runtime({})('src/server/services/faculty-assessment.ts');
  assert.deepEqual(validateAssessmentAnswers(criteria, { answers: {}, comments: '' }, false).answers, {});
  for (const answers of [{}, { rating: 6 }, { rating: 2.5 }, { rating: '5' }, { rating: 3, foreign: 4 }]) assert.throws(() => validateAssessmentAnswers(criteria, { answers, comments: '' }, true));
  assert.throws(() => validateAssessmentAnswers([{ ...criteria[0], type: 'UNKNOWN' }], { answers: {}, comments: '' }, false));
  assert.equal(validateAssessmentAnswers(criteria, { answers: { rating: 4 }, comments: 'Stored comment' }, true).answers.rating, 4);
});

test('sparse configured rating options and required template comments are enforced without inventing intermediate ratings', () => {
  const { validateAssessmentAnswers } = runtime({})('src/server/services/faculty-assessment.ts');
  const sparse = [{ ...criteria[0], min: -2, max: 10, options: [{ value: -2, label: 'Needs work' }, { value: 0, label: 'Neutral' }, { value: 10, label: 'Excellent' }] }];
  for (const value of [-2, 0, 10]) assert.equal(validateAssessmentAnswers(sparse, { answers: { rating: value }, comments: '' }, true).answers.rating, value);
  for (const value of [-1, 1, 5, '0']) assert.throws(() => validateAssessmentAnswers(sparse, { answers: { rating: value }, comments: '' }, true), /allowed values/);
  const prompts = [{ id: 'prompt', prompt: 'Evidence', required: true, order: 0 }];
  assert.throws(() => validateAssessmentAnswers(sparse, { answers: { rating: 0 }, comments: '' }, true, prompts), /required comment/);
  const response = { answers: { rating: 0 }, comments: 'Legacy note', promptAnswers: { prompt: 'Evidence retained' } };
  assert.deepEqual(validateAssessmentAnswers(sparse, response, true, prompts), response);
  assert.throws(() => validateAssessmentAnswers(sparse, { ...response, promptAnswers: { other: 'foreign' } }, false, prompts), /Invalid template comments/);
});

test('assigned templates stay linked and template edits change revisions before a stale draft can be written', async () => {
  const db = assessmentDatabase({ templateId: 'assigned-older-template', responses: { answers: {}, comments: '' } }), load = runtime(db);
  const { getFacultyAssessment, assessmentView } = load('src/server/queries/faculty-assessment.ts');
  const form = await getFacultyAssessment(user, { database: db });
  const result = await load('src/server/services/faculty-assessment.ts').saveFacultyAssessment(user, { action: 'save', revision: form.revision, responses: { answers: { rating: 4 }, comments: '' } });
  assert.equal(result.form.templateId, 'assigned-older-template');
  assert.ok(db.calls.some(call => call.template?.where.templateId === 'assigned-older-template'));
  const row = { ...form, scheduledAt: new Date(form.scheduledAt), observerSignedAt: null, observeeSignedAt: null };
  assert.notEqual(assessmentView({ ...row, templateRevision: 1 }, user).revision, form.revision);
  assert.notEqual(assessmentView({ ...row, criteria: [{ ...criteria[0], options: [{ value: 0, label: 'Zero' }, { value: 4, label: 'Four' }] }] }, user).revision, form.revision);
  assert.ok(db.calls.some(call => call.assessment));
  db.changeTemplate({ templateRevision: 1 });
  const writesBefore = db.calls.filter(call => call.assessment).length;
  await assert.rejects(load('src/server/services/faculty-assessment.ts').saveFacultyAssessment(user, { action: 'save', revision: result.form.revision, responses: result.form.responses }), /changed/);
  assert.equal(db.calls.filter(call => call.assessment).length, writesBefore);
});

test('Faculty form retains its three-step design and renders configured sparse labels, comments and signature labels', async () => {
  const configured = [{ ...criteria[0], options: [{ value: 0, label: 'Needs support' }, { value: 10, label: 'Excellent' }] }];
  const db = assessmentDatabase({ criteria: configured, signatureLabels: { observer: 'Reviewer', observee: 'Faculty member' },
    commentPrompts: [{ id: actorId, prompt: 'Classroom evidence', required: true, order: 0 }], responses: { answers: { rating: 0 }, comments: 'Retained note' } });
  const load = runtime(db);
  const form = await load('src/server/queries/faculty-assessment.ts').getFacultyAssessment(user, { database: db });
  const { FacultyAssessmentScreen } = load('src/components/observations/faculty-assessment-screen.tsx');
  const html = renderToStaticMarkup(createElement(FacultyAssessmentScreen, { initial: form }));
  for (const text of ['Step 1 of 3', '0 · Needs support', '10 · Excellent', 'Classroom evidence', 'Reviewer', 'Faculty member', 'Retained note']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('1 · Minimum'));
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
  assert.ok(db.calls.some(call => call.observation?.status === 'COMPLETED'));
  await assert.rejects(act(user, { action: 'save', revision: finalized.form.revision, responses: review.responses }), /not available/);
  assert.equal(db.calls.filter(call => call.notification).length, 2);
  assert.ok(db.calls.some(call => call.touch));
  assert.ok(db.calls.some(call => call.rollback));
});

test('assessment rejects revoked access and a nonparticipant before any write', async () => {
  const db = assessmentDatabase();
  const { saveFacultyAssessment } = runtime(db)('src/server/services/faculty-assessment.ts');
  await assert.rejects(saveFacultyAssessment({ ...user, permissions: [] }, {}), /Forbidden/);
  assert.equal(db.calls.length, 0);
  await assert.rejects(saveFacultyAssessment({ ...user, id: sectionId }, { action: 'save', revision: 'spoof', responses: {} }), /required/);
  assert.ok(!db.calls.some(call => call.assessment));
});

test('signup input rejects injected identity, duplicate dates and empty selections before a connection', async () => {
  const { signupInput, submitFacultySignup } = runtime({})('src/server/services/faculty-actions.ts');
  for (const body of [{ sectionId, dates: [] }, { sectionId, dates: ['2026-10-19', '2026-10-19'] }, { sectionId, dates: ['2026-10-19'], professorId: actorId }, { sectionId: 'bad', dates: ['2026-10-19'] }]) assert.throws(() => signupInput(body));
  await assert.rejects(submitFacultySignup({ ...user, permissions: [] }, {}), /Forbidden/);
});

test('signup writes use one Serializable transaction and reject unavailable dates before creating records', async () => {
  const workspace = { dashboard: { ...dashboard, cycle: { ...cycle, signupDeadline: '2099-01-01' } }, signup: { allowed: true }, sections: [{ id: sectionId, meetings, options: [{ date: '2026-10-26' }] }] };
  for (const scenario of ['success', 'unavailable', 'duplicate', 'failed']) {
    const writes = []; let rolledBack = false;
    const db = { $transaction: async (run, opts) => { assert.equal(opts.isolationLevel, 'Serializable'); try { return await run(db); } catch (error) { rolledBack = true; throw error; } }, professor: { findUnique: async args => { assert.equal(args.where.userId, actorId); return { professorId: observeeId }; } }, evaluationSignup: { create: async ({data}) => { if (scenario === 'duplicate') throw {code:'P2002'}; writes.push(data); } }, observation: { create: async ({data}) => { if (scenario === 'failed') throw new Error('insert failed'); writes.push(data); } }, observationTimeOption: { create: async ({data}) => writes.push(data) } };
    const act = runtime(db, user, { workflow: workspace })('src/server/services/faculty-actions.ts').submitFacultySignup(user, { sectionId, dates: [scenario === 'unavailable' ? '2026-10-27' : '2026-10-26'] });
    if (scenario === 'success') { await act; assert.equal(writes.length, 3); assert.equal(writes[0].professorId, observeeId); assert.equal(writes[0].sectionId, sectionId); }
    else { await assert.rejects(act); assert.equal(rolledBack, true); if (scenario === 'unavailable') assert.equal(writes.length, 0); }
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
