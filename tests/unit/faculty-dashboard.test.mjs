import {activityPreview} from '../../src/lib/activity-preview.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { facultyEvaluationStatus, facultyEligibility } from '../../src/server/services/faculty-evaluation.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const actor = { id: '11111111-1111-4111-8111-111111111111', username: 'test', name: 'Test', roles: ['Faculty'],
  permissions: ['profile.read.own', 'evaluation-status.read.own', 'observations.read.own', 'notifications.read.own'] };
const professorId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-10-19T12:00:00Z');
const cycle = { id: 'cycle', name: 'Current cycle', semesterId: 'semester', semester: 'Fall 2026', termCode: '26f',
  startsOn: '2026-08-20', endsOn: '2026-12-20', timeZone: 'America/Chicago',
  signupDeadline: new Date('2026-10-31T12:00:00Z'), observationDeadline: new Date('2026-11-30T12:00:00Z'), feedbackDeadline: new Date('2026-12-07T12:00:00Z') };
const evaluation = { hiringLevel: 'Associate Professor', intervalYears: 2, observationId: null, completedAt: null, semesterId: null, semester: null, termCode: null };

test('documented eligibility handles first semester, established faculty, missing data, voluntary signup and current rank intervals', () => {
  const cycle = { termCode: '26f', startsOn: '2026-08-20', endsOn: '2026-12-20' };
  const oldHire = new Date('2020-01-01');
  assert.equal(facultyEligibility(cycle, null, 1, new Date('2026-09-01'), []).status, 'ineligible');
  assert.equal(facultyEligibility(cycle, null, 1, oldHire, []).status, 'due');
  assert.equal(facultyEligibility(cycle, null, 1, null, ['26s']).canSignUp, true);
  assert.equal(facultyEligibility(cycle, null, 1, null, ['26f']).canSignUp, false);
  assert.equal(facultyEligibility(cycle, '25f', 2, oldHire, []).status, 'notDue');
  assert.equal(facultyEligibility(cycle, '25f', 2, oldHire, []).canSignUp, true);
  assert.equal(facultyEligibility(cycle, '25f', 1, oldHire, []).status, 'due');
  assert.equal(facultyEligibility(cycle, '26f', 1, oldHire, []).canSignUp, false);
  assert.equal(facultyEligibility(cycle, '27s', 1, oldHire, []).canSignUp, false);
  assert.equal(facultyEligibility(cycle, null, 0, oldHire, []).canSignUp, false);
});

function database(overrides = {}) {
  const calls = [];
  const invoke = (key, action) => async args => { calls.push({ [key]: args }); if (overrides.fail) throw new Error('private database error'); return action(args); };
  return { calls,
    professor: { findUnique: invoke('profile', () => overrides.noProfile ? null : { professorId, hiringLevel: { levelName: (overrides.evaluation ?? evaluation).hiringLevel, evaluationIntervalYears: (overrides.evaluation ?? evaluation).intervalYears }, hireDate: null, teaches: [] }) },
    evaluationSignup: { findFirst: invoke('signup', () => overrides.signedUp ? { signupId: 'own-signup' } : null) },
    evaluationCycle: { findMany: invoke('prisma', () => overrides.noCycle ? [] : (overrides.multipleCycles ? [cycle, { ...cycle, id: 'second' }] : [cycle]).map(c => ({ cycleId: c.id, cycleName: c.name, semesterId: c.semesterId, signupDeadline: c.signupDeadline, observationDeadline: c.observationDeadline, feedbackDeadline: c.feedbackDeadline, semester: { termName: c.semester, termCode: c.termCode, startsOn: new Date(c.startsOn), endsOn: new Date(c.endsOn), timeZone: c.timeZone } }))) },
    observation: { findMany: invoke('observations', args => {
      if (args.where.signedAssessment) { const e = overrides.evaluation; return e?.observationId ? [{ observationId: e.observationId, signedAssessment: { completedAt: e.completedAt }, cycle: { semesterId: e.semesterId, semester: { termName: e.semester, termCode: e.termCode } } }] : []; }
      const o = overrides.observation; return o ? [{ observationId: o.id, status: o.status, observerId: professorId, scheduledAt: o.scheduledAt, signup: { professorId: o.participation === 'observee' ? professorId : 'other', section: { course: { courseCode: o.course }, sectionCode: o.section } } }] : [];
    }) },
    observationCandidate: { count: invoke('pending', () => overrides.count ?? 0) },
    notification: { findMany: invoke('activity', () => (overrides.activity ?? []).map(row => ({ ...row, notificationId: row.id }))) },
  };
}

// Same TypeScript-transpile/Node-test setup as the existing component tests.
// Only request identity and the database transport are replaced; queries/route/page execute unchanged.
function runtime(db, user = actor, authFailure = false) {
  const cache = new Map();
  function load(filename) {
    const path = resolve(root, filename);
    if (cache.has(path)) return cache.get(path);
    const loadedModule = { exports: {} };
    const localRequire = name => {
      if (name === 'server-only') return {};
      if (name.endsWith('/faculty-context')) return { selectedFacultyCycle: async () => null, selectedFacultyObservation: async () => null };
      if (name === '@/server/permissions') return {
        getCurrentUser: async () => { if (authFailure) throw new Error('private account error'); return user; },
        requirePermission: async permission => { if (!user || !user.permissions.includes(permission)) throw new Error('Access denied'); return user; },
      };
      if (name === '../db') return { getPool: () => db };
      if (name === '../prisma') return { getPrisma: () => db };
      if (name === 'next/navigation') return { redirect: path => { throw new Error(`Redirect: ${path}`); }, useRouter: () => ({ refresh() {} }) };
      if (!name.startsWith('@/') && !name.startsWith('.')) return require(name);
      const base = name.startsWith('@/') ? resolve(root, 'src', name.slice(2)) : resolve(dirname(path), name);
      return load(existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`);
    };
    const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
    } });
    new Function('require', 'module', 'exports', outputText)(localRequire, loadedModule, loadedModule.exports);
    cache.set(path, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}

test('evaluation intervals use semester order, including assistant annual and associate/full biennial boundaries', () => {
  for (const [current, previous, interval, expected] of [
    ['26f', '25f', 1, 'due'], ['26s', '25f', 1, 'due'], ['26f', '25s', 1, 'due'], ['27s', '25f', 1, 'overdue'],
    ['26f', '24f', 2, 'due'], ['26s', '24f', 2, 'notDue'], ['27s', '24f', 2, 'overdue'],
  ]) assert.equal(facultyEvaluationStatus(current, previous, interval).status, expected);
});

test('missing history, missing cycle, invalid intervals/terms and future history remain unknown', () => {
  for (const args of [['26f', null, 1], [null, '24f', 2], ['invalid', '24f', 2], ['26f', 'bad', 1],
    ['26f', '24f', 0], ['26f', '24f', null], ['26f', '24f', 1.5], ['26f', '27s', 1]]) {
    assert.equal(facultyEvaluationStatus(...args).status, 'unknown');
  }
});

test('missing base permission is denied before any dashboard SQL executes', async () => {
  const db = database();
  const { getFacultyDashboard, DashboardForbidden } = runtime(db)('src/server/queries/faculty-dashboard.ts');
  await assert.rejects(getFacultyDashboard({ ...actor, permissions: ['test:admin'] }), DashboardForbidden);
  assert.equal(db.calls.length, 0);
});

test('reserved fixture identities never map to database accounts', async () => {
  const db = database();
  const result = await runtime(db)('src/server/queries/faculty-dashboard.ts').getFacultyDashboard({ ...actor, id: 'demo:faculty' }, { now });
  assert.equal(result.hasFacultyProfile, false);
  assert.equal(result.evaluation.status, 'unknown');
  assert.equal(result.pendingObserverRequestCount, 0);
  assert.equal(db.calls.length, 0);
});

test('seeded empty records produce unknown eligibility and real zero/empty summaries scoped to session identity', async () => {
  const db = database();
  const result = await runtime(db)('src/server/queries/faculty-dashboard.ts').getFacultyDashboard(actor, { now });
  assert.equal(result.evaluation.status, 'unknown');
  assert.equal(result.evaluation.hiringLevel, 'Associate Professor');
  assert.equal(result.evaluation.lastCompletedEvaluation, null);
  assert.equal(result.cycle.semester, 'Fall 2026');
  assert.equal(result.currentObservation, null);
  assert.equal(result.pendingObserverRequestCount, 0);
  assert.deepEqual(result.recentActivity, []);
  assert.deepEqual(db.calls[0].profile.where, { userId: actor.id });
  const past = db.calls.find(c => c.observations?.where.signedAssessment).observations;
  assert.equal(past.where.signup.professorId, professorId);
  assert.deepEqual(past.where.signedAssessment.is, { isLocked: true, observerSignedAt: { not: null }, observeeSignedAt: { not: null } });
  const active = db.calls.find(c => c.observations?.where.cycleId).observations;
  assert.deepEqual(active.where.OR, [{ signup: { professorId } }, { observerId: professorId }]);
  const pending = db.calls.find(c => c.pending).pending;
  assert.equal(pending.where.professorId, professorId); assert.deepEqual(pending.where.expiresAt, { gt: now });
  assert.equal(pending.where.observation.observerId, null); assert.deepEqual(pending.where.observation.cycle.observationDeadline, { gt: now });
  const activity = db.calls.find(c => c.activity).activity; assert.equal(activity.where.userId, actor.id); assert.equal(activity.take, 5);
});

test('completed evaluation, active participation and notification values are returned instead of preview constants', async () => {
  const db = database({ evaluation: { ...evaluation, observationId: 'completed', completedAt: new Date('2024-11-10T12:00:00Z'), semesterId: 'past', semester: 'Fall 2024', termCode: '24f' },
    observation: { id: 'active', status: 'CONFIRMED', participation: 'observer', course: 'TEST', section: '1', scheduledAt: now },
    count: 3, activity: [{ id: 'notification', title: 'Update', message: 'Own notification', createdAt: now }] });
  const result = await runtime(db)('src/server/queries/faculty-dashboard.ts').getFacultyDashboard(actor, { now });
  assert.equal(result.evaluation.status, 'due');
  assert.equal(result.evaluation.lastCompletedEvaluation.semester, 'Fall 2024');
  assert.equal(result.currentObservation.participation, 'observer');
  assert.equal(result.pendingObserverRequestCount, 3);
  assert.equal(result.recentActivity[0].createdAt, now.toISOString());
});

test('individual permission revocation suppresses private reads rather than showing fabricated zeros', async () => {
  const db = database();
  const result = await runtime(db)('src/server/queries/faculty-dashboard.ts').getFacultyDashboard({ ...actor, roles: ['Admin'], permissions: ['profile.read.own'] }, { now });
  assert.deepEqual(result.access, { evaluation: false, observations: false, activity: false });
  assert.equal(result.evaluation.hiringLevel, null);
  assert.equal(result.pendingObserverRequestCount, null);
  assert.equal(db.calls.length, 1); // No relevant-cycle grant: profile only.
});

test('no cycle still allows the latest completed evaluation and own notifications, but no active-cycle queries', async () => {
  const db = database({ noCycle: true });
  const result = await runtime(db)('src/server/queries/faculty-dashboard.ts').getFacultyDashboard(actor, { now });
  assert.equal(result.cycle, null);
  assert.equal(result.evaluation.status, 'unknown');
  assert.equal(result.currentObservation, null);
  assert.equal(result.pendingObserverRequestCount, 0);
  assert.ok(!db.calls.some(c => c.observations?.where.cycleId || c.pending));
});

test('Faculty cycle lookup reuses own teaching/participation scope even for managers and never chooses between overlapping cycles', async () => {
  const db = database({ multipleCycles: true });
  const manager = { ...actor, roles: ['Admin'], permissions: [...actor.permissions, 'cycles.read', 'cycles.manage'] };
  const result = await runtime(db)('src/server/queries/faculty-dashboard.ts').getFacultyDashboard(manager, { now });
  assert.equal(result.cycle, null);
  assert.match(result.cycleReason, /Choose a relevant/);
  assert.equal(result.pendingObserverRequestCount, null);
  assert.equal(result.evaluation.status, 'unknown');
  assert.ok(!db.calls.some(call => call.observations?.where.cycleId));
  const args = db.calls.find(call => call.prisma).prisma;
  const scope = args.where.AND[0].OR;
  assert.equal(scope.length, 4);
  assert.equal(scope[0].semester.courseSections.some.teaches.some.professor.userId, actor.id);
  assert.equal(scope[1].signups.some.professor.userId, actor.id);
  assert.equal(scope[2].observations.some.observer.userId, actor.id);
  assert.equal(scope[3].observations.some.currentReleasedList.is.candidates.some.professor.userId, actor.id);
  assert.deepEqual(scope[3].observations.some.currentReleasedList.is.publishedAt, { not: null });
  assert.deepEqual(args.where.AND[1], { feedbackDeadline: { gte: now } });
});

test('accounts without a professor profile do not read another professor, but can read their own notifications', async () => {
  const db = database({ noProfile: true });
  const result = await runtime(db)('src/server/queries/faculty-dashboard.ts').getFacultyDashboard(actor, { now });
  assert.equal(result.hasFacultyProfile, false);
  assert.equal(db.calls.length, 2);
  assert.equal(db.calls[1].activity.where.userId, actor.id);
});

test('private API responses include no-store for anonymous, denied, success, and dependency failures', async () => {
  for (const [user, db, authFailure, expected] of [[null, database(), false, 401],
    [{ ...actor, permissions: [] }, database(), false, 403], [actor, database(), false, 200],
    [actor, database({ fail: true }), false, 503], [actor, database(), true, 503]]) {
    const route = runtime(db, user, authFailure)('src/app/api/me/dashboard/route.ts');
    const response = await route.GET(new Request('http://localhost/api/me/dashboard?userId=another-user&role=Admin'));
    assert.equal(response.status, expected);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const body = await response.json();
    assert.ok(!JSON.stringify(body).includes('private database error'));
    assert.ok(!JSON.stringify(body).includes('private account error'));
    if (expected === 200) assert.equal(db.calls[0].profile.where.userId, actor.id);
    if (expected === 401 || expected === 403) assert.equal(db.calls.length, 0);
  }
});

test('dashboard renders real empty states and preserves its three working shortcuts; failures are unavailable', async () => {
  for (const fail of [false, true]) {
    const load = runtime(database({ fail }));
    const page = await load('src/app/(main)/dashboard/page.tsx').default();
    const html = renderToStaticMarkup(createElement(() => page));
    for (const path of ['/observations/signup', '/observations/details', '/observations/requests']) assert.ok(html.includes(`href="${path}"`));
    if (fail) assert.ok(html.includes('Dashboard data is temporarily unavailable'));
    else {
      assert.ok(html.includes('0 pending'));
      assert.ok(html.includes('No current observation'));
      assert.ok(html.includes('No recent activity'));
      assert.ok(html.includes('None recorded'));
    }
    assert.ok(!html.includes('Two observer requests are awaiting a response'));
  }
});

test('recent activity renders a bounded preview and links to the full notification',async()=>{
 const message='A long faculty message '+ 'x'.repeat(400)+' HIDDEN_MESSAGE_TAIL';
 const page=await runtime(database({activity:[{id:'notice',title:'Faculty message',message,createdAt:now}]}))('src/app/(main)/dashboard/page.tsx').default();
 const html=renderToStaticMarkup(createElement(()=>page));
 assert.ok(html.includes('A long faculty message'));assert.ok(!html.includes('HIDDEN_MESSAGE_TAIL'));assert.ok(html.includes('…'));assert.ok(html.includes('href="/notifications"'));assert.ok(html.includes('View full message in Notifications'));assert.ok(html.includes('line-clamp-2'));
});

test('activity previews collapse whitespace and preserve whole Unicode characters at the cutoff',()=>{
 assert.equal(activityPreview('Short\n\n message'),'Short message');assert.equal(activityPreview(''),'');
 assert.equal(activityPreview('😀'.repeat(181)),'😀'.repeat(180)+'…');assert.equal(activityPreview('x'.repeat(180)),'x'.repeat(180));
});

test('dashboard reads own signup in the selected cycle and renders the same progress labels as My Evaluation',async()=>{
 const user={...actor,permissions:[...actor.permissions,'signups.read.own']};
 for(const signedUp of [true,false]){
  const db=database({signedUp,observation:{id:'observing',status:'PENDING',participation:'observer',course:'TEST',section:'1',scheduledAt:null}});
  const result=await runtime(db,user)('src/server/queries/faculty-dashboard.ts').getFacultyDashboard(user,{now});
  assert.equal(result.hasCurrentSignup,signedUp);const query=db.calls.find(c=>c.signup).signup;assert.deepEqual(query.where,{cycleId:cycle.id,professor:{userId:actor.id}});
  const tree=await runtime(database({signedUp}),user)('src/app/(main)/dashboard/page.tsx').default();
  const output=renderToStaticMarkup(createElement(()=>tree));
  assert.ok(output.includes(signedUp?'Signed up':'Unknown'));assert.equal(output.includes('View Observation Details'),signedUp);
 }
 const restricted=database({signedUp:true});const hidden=await runtime(restricted)('src/server/queries/faculty-dashboard.ts').getFacultyDashboard(actor,{now});assert.equal(hidden.hasCurrentSignup,null);assert.ok(!restricted.calls.some(c=>c.signup));
 const noCycle=database({signedUp:true,noCycle:true});assert.equal((await runtime(noCycle,user)('src/server/queries/faculty-dashboard.ts').getFacultyDashboard(user,{now})).hasCurrentSignup,null);assert.ok(!noCycle.calls.some(c=>c.signup));
 const completed=database({signedUp:true,evaluation:{...evaluation,observationId:'done',completedAt:now,semesterId:cycle.semesterId,semester:cycle.semester,termCode:cycle.termCode}});
 const tree=await runtime(completed,user)('src/app/(main)/dashboard/page.tsx').default();assert.ok(renderToStaticMarkup(createElement(()=>tree)).includes('Completed'));
});
