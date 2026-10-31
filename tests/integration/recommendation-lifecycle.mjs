// Actual service transactions in a disposable database, never the application database.
import '../configuration-loader.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import ts from 'typescript';
import { PrismaPg } from '@prisma/adapter-pg';
import { facultyPermissions, acPermissions } from '../../prisma/seed-data.mjs';
const { PrismaClient } = await import('../../src/generated/prisma/client.ts');
const appUrl = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(appUrl.hostname));
appUrl.searchParams.delete('schema');
const databaseName = `recommendations_test_${randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(appUrl); testUrl.pathname = `/${databaseName}`;
const admin = new pg.Pool({ connectionString: appUrl.toString(), connectionTimeoutMillis: 5000 });
const pool = new pg.Pool({ connectionString: testUrl.toString(), connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl.toString() }) });
const root = fileURLToPath(new URL('../../', import.meta.url)), require = createRequire(import.meta.url), cache = new Map();
let requestUser = null;
function load(filename) {
  const path = resolve(root, filename); if (cache.has(path)) return cache.get(path);
  const loaded = { exports: {} }; cache.set(path, loaded.exports);
  function localRequire(name) {
    if (name === 'server-only') return {};
    if (name.endsWith('/prisma')) return { getPrisma: () => db };
    if (name.endsWith('/permissions')) return { getCurrentUser: async () => requestUser };
    if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
    const base = name.startsWith('@/') ? resolve(root, 'src', name.slice(2)) : resolve(dirname(path), name);
    return load(existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`);
  }
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', output)(localRequire, loaded, loaded.exports);
  cache.set(path, loaded.exports); return loaded.exports;
}
const service = load('src/server/services/faculty-invitations.ts');
const reads = load('src/server/queries/faculty-links.ts');
const candidateReads = load('src/server/queries/observation-candidates.ts');
const actor = { id: randomUUID(), permissions: [...acPermissions, ...facultyPermissions] };
const faculty = Array.from({ length: 4 }, (_, i) => ({ id: randomUUID(), professorId: randomUUID(), name: `Lifecycle ${i}`, permissions: [...facultyPermissions] }));
const cycleId = randomUUID(), semesterId = randomUUID(), departmentId = randomUUID(), levelId = randomUUID(), courseId = randomUUID();
const now = new Date(), day = 86400000, meetingDate = new Date(now.getTime() + 7 * day).toISOString().slice(0, 10);
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${meetingDate}T12:00:00Z`));
const observations = [], options = [];
const observation = id => db.observation.findUniqueOrThrow({ where: { observationId: id } });
const targets = async ids => Promise.all(ids.map(async id => { const record = await observation(id); return { observationId: id, listId: record.currentDraftListId, expectedRevision: record.workflowRevision, expectedReleasedListId: record.currentReleasedListId }; }));
const publish = async (ids, extra = {}) => service.releaseRecommendations(actor, cycleId, { requestKey: randomUUID(), targets: await targets(ids), ...extra });
const regenerate = async id => service.regenerateRecommendations(actor, id, { requestKey: randomUUID(), expectedRevision: (await observation(id)).workflowRevision });
const members = async (id, listId) => db.observationCandidate.findMany({ where: { observationId: id, recommendationListId: listId }, orderBy: { candidateId: 'asc' } });
const candidateFor = (list, index) => list.find(c => c.professorId === faculty[index].professorId);
const currentMembers = async id => members(id, (await observation(id)).currentReleasedListId);
const snapshot = async () => JSON.stringify(await Promise.all([
  db.observation.findMany({ orderBy: { observationId: 'asc' } }), db.observationCandidate.findMany({ orderBy: { candidateId: 'asc' } }),
  db.invitationAttempt.findMany({ orderBy: { attemptId: 'asc' } }), db.lateAcceptanceApproval.findMany({ orderBy: { approvalId: 'asc' } }),
  db.observationAssignmentHistory.findMany({ orderBy: { historyId: 'asc' } }), db.notification.count(), db.notificationEmail.count(), db.recommendationOperation.count(),
]));
let created = false;
try {
  await admin.query(`CREATE DATABASE "${databaseName}"`); created = true;
  for (const name of (await readdir(new URL('../../prisma/migrations/', import.meta.url), { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort()) {
    await pool.query(await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8'));
  }
  await db.appUser.createMany({ data: [actor, ...faculty].map((user, i) => ({ userId: user.id, fullName: user.name ?? 'AC', email: `lifecycle${i}@test.invalid` })) });
  const role = await db.role.create({ data: { roleName: 'AC' } });
  await db.userRole.create({ data: { userId: actor.id, roleId: role.roleId } });
  await db.department.create({ data: { departmentId, departmentName: 'Lifecycle CS' } });
  await db.hiringLevel.create({ data: { hiringLevelId: levelId, levelName: 'Assistant Professor', evaluationIntervalYears: 1 } });
  await db.semester.create({ data: { semesterId, termCode: `${String(now.getUTCFullYear()).slice(2)}f`, termName: 'Lifecycle', startsOn: new Date(now.getTime() - 60 * day), endsOn: new Date(now.getTime() + 60 * day), timeZone: 'America/Chicago' } });
  await db.evaluationCycle.create({ data: { cycleId, semesterId, cycleName: 'Lifecycle', signupDeadline: new Date(now.getTime() - day), observationDeadline: new Date(now.getTime() + 30 * day), feedbackDeadline: new Date(now.getTime() + 40 * day) } });
  await db.course.create({ data: { courseId, departmentId, courseCode: 'TEST4000', courseTitle: 'Lifecycle', courseLevel: 4000 } });
  for (let i = 0; i < faculty.length; i++) {
    const user = faculty[i];
    await db.professor.create({ data: { professorId: user.professorId, userId: user.id, departmentId, hiringLevelId: levelId } });
    const section = await db.courseSection.create({ data: { courseId, semesterId, sectionCode: String(i), teaches: { create: { professorId: user.professorId } },
      ...(i < 2 ? { classMeetings: { create: { dayOfWeek: weekday, startTime: i ? '14:00' : '10:00', endTime: i ? '15:00' : '11:00', location: 'Lifecycle room' } } } : {}) } });
    // Potential observers 2 and 3 deliberately have no signup.
    const signup = i < 2 ? await db.evaluationSignup.create({ data: { cycleId, professorId: user.professorId, sectionId: section.sectionId } }) : null;
    if (i < 2) {
      const record = await db.observation.create({ data: { signupId: signup.signupId, cycleId } }); observations.push(record.observationId);
      const option = await db.observationTimeOption.create({ data: { observationId: record.observationId, preferredDate: new Date(`${meetingDate}T00:00:00Z`) } }); options.push(option.timeOptionId);
    }
  }
  const [first, second] = observations;
  await assert.rejects(service.regenerateRecommendations({ ...actor, permissions: [] }, first, { expectedRevision: 0, requestKey: randomUUID() }), e => e.status === 403);
  const route = load('src/app/api/observations/[observationId]/recommendations/regenerate/route.ts');
  assert.equal((await route.POST(new Request('http://local/regenerate', { method: 'POST', body: '{}' }), { params: Promise.resolve({ observationId: first }) })).status, 401);
  const initialRequest = { scope: { observationIds: observations }, requestKey: randomUUID() };
  const generation = await service.generateRecommendations(actor, cycleId, initialRequest);
  assert.deepEqual(await service.generateRecommendations(actor, cycleId, initialRequest), generation);
  assert.equal(await db.recommendationList.count(), 2);
  await publish(observations, { all: true });
  const releasedA = await observation(first), aMembers = await currentMembers(first);
  const a2 = candidateFor(aMembers, 2), a3 = candidateFor(aMembers, 3); assert.ok(a2 && a3);
  await service.sendFacultyInvitations(faculty[0], { observationId: first, candidateIds: [a2.candidateId, a3.candidateId] });
  const attempt2 = await db.invitationAttempt.findFirstOrThrow({ where: { candidateId: a2.candidateId } });
  const attempt3 = await db.invitationAttempt.findFirstOrThrow({ where: { candidateId: a3.candidateId } });
  await service.acceptFacultyInvitation(faculty[2], { candidateId: a2.candidateId, attemptId: attempt2.attemptId, meetingOptionId: options[0] });
  await db.invitationAttempt.update({ where: { attemptId: attempt3.attemptId }, data: { invitedAt: new Date(now.getTime() - 3 * day), expiresAt: new Date(now.getTime() - 1000), status: 'EXPIRED' } });
  await db.observationCandidate.update({ where: { candidateId: a3.candidateId }, data: { invitedAt: new Date(now.getTime() - 3 * day), expiresAt: new Date(now.getTime() - 1000), status: 'EXPIRED' } });
  await service.requestLateAcceptance(faculty[3], { candidateId: a3.candidateId, attemptId: attempt3.attemptId, reason: 'Actual historical request' });
  const approval = await db.lateAcceptanceApproval.findUniqueOrThrow({ where: { attemptId: attempt3.attemptId } });
  const beforeRegeneration = await members(first, releasedA.currentReleasedListId);
  const b = await regenerate(first);
  assert.notEqual(b.listId, releasedA.currentReleasedListId);
  assert.deepEqual(await members(first, releasedA.currentReleasedListId), beforeRegeneration);
  const visible = await reads.getFacultyLinks(faculty[0], cycleId);
  assert.deepEqual(new Set(visible.recommendations.filter(c => c.observationId === first).map(c => c.id)), new Set(aMembers.map(c => c.candidateId)));
  const draftRead = await db.$transaction(tx => candidateReads.getObservationCandidates(tx, actor, first, new URL('http://local/candidates')));
  assert.equal(draftRead.list.id, b.listId);
  const staleTargets = await targets([first]);
  await service.selectFacultyObserver(faculty[0], { candidateId: a2.candidateId });
  const paired = await observation(first); assert.equal(paired.observerId, faculty[2].professorId);
  await assert.rejects(publish([first], { targets: staleTargets }), e => e.status === 409);
  const publication = { requestKey: randomUUID(), targets: await targets([first]) };
  const published = await service.releaseRecommendations(actor, cycleId, publication);
  const afterPublication = await snapshot();
  assert.deepEqual(await service.releaseRecommendations(actor, cycleId, publication), published);
  assert.equal(await snapshot(), afterPublication);
  await assert.rejects(service.releaseRecommendations(actor, cycleId, { ...publication, all: true }), e => e.status === 409);
  assert.equal(await snapshot(), afterPublication);
  const reopened = await observation(first);
  assert.equal(reopened.currentReleasedListId, b.listId); assert.equal(reopened.observerId, null); assert.equal(reopened.scheduledAt, null); assert.equal(reopened.status, 'PENDING');
  const history = await db.observationAssignmentHistory.findFirstOrThrow({ where: { observationId: first } });
  assert.equal(history.candidateId, a2.candidateId); assert.equal(history.professorId, paired.observerId);
  assert.deepEqual(history.scheduledAt, paired.scheduledAt); assert.deepEqual(history.selectedAt, paired.observerSelectedAt);
  assert.equal(history.selectedById, faculty[0].id); assert.equal(history.replacementListId, b.listId);
  const retainedAttempt = await db.invitationAttempt.findUniqueOrThrow({ where: { attemptId: attempt2.attemptId } });
  assert.equal(retainedAttempt.status, 'ACCEPTED'); assert.equal(retainedAttempt.acceptedOptionId, options[0]); assert.ok(retainedAttempt.cancelledAt && retainedAttempt.respondedAt);
  assert.deepEqual(await db.lateAcceptanceApproval.findUnique({ where: { approvalId: approval.approvalId } }), approval);
  for (const action of ['acceptFacultyInvitation', 'declineFacultyInvitation']) await assert.rejects(service[action](faculty[2], { candidateId: a2.candidateId, attemptId: attempt2.attemptId, ...(action.startsWith('accept') ? { meetingOptionId: options[0] } : {}) }), e => e.status === 409);
  await assert.rejects(service.selectFacultyObserver(faculty[0], { candidateId: a2.candidateId }), e => e.status === 409);
  await assert.rejects(service.reviewLateAcceptance(actor, approval.approvalId, { decision: 'approved' }), e => e.status === 409);
  await assert.rejects(service.releaseRecommendations(actor, cycleId, { ...publication, targets: [] }), e => [400, 409].includes(e.status));
  console.log('PASS draft/release isolation, initial and individual replacement, usable A while B exists, historical assignment/responses/approvals, stale protection and retry identity');

  const secondA = await currentMembers(second), pending = candidateFor(secondA, 3);
  await service.sendFacultyInvitations(faculty[1], { observationId: second, candidateIds: [pending.candidateId] });
  const pendingAttempt = await db.invitationAttempt.findFirstOrThrow({ where: { candidateId: pending.candidateId } });
  const bSecond = await regenerate(second), cFirst = await regenerate(first); assert.notEqual(bSecond.generationId, cFirst.generationId);
  const mixed = (await targets(observations)).sort((a, b) => a.observationId.localeCompare(b.observationId));
  const atomicBefore = await snapshot();
  await assert.rejects(publish(observations, { targets: mixed.map((t, i) => i === mixed.length - 1 ? { ...t, expectedRevision: t.expectedRevision + 1 } : t) }), e => e.status === 409);
  assert.equal(await snapshot(), atomicBefore);
  await assert.rejects(publish([first], { all: true }), e => e.status === 409); assert.equal(await snapshot(), atomicBefore);
  const batch = { requestKey: randomUUID(), targets: mixed, all: true };
  const concurrent = await Promise.allSettled([0, 1].map(() => service.releaseRecommendations(actor, cycleId, batch)));
  assert.ok(concurrent.some(r => r.status === 'fulfilled'));
  assert.ok(concurrent.every(r => r.status === 'fulfilled' || r.reason.status === 503));
  const batchResult = await service.releaseRecommendations(actor, cycleId, batch); assert.equal(batchResult.releasedObservationIds.length, 2);
  const batchSnapshot = await snapshot(); await service.releaseRecommendations(actor, cycleId, batch); assert.equal(await snapshot(), batchSnapshot);
  const cancelled = await db.invitationAttempt.findUniqueOrThrow({ where: { attemptId: pendingAttempt.attemptId } });
  assert.equal(cancelled.status, 'CANCELLED'); assert.equal(cancelled.respondedAt, null); assert.equal(cancelled.supersededByListId, bSecond.listId); assert.ok(cancelled.cancelledAt);
  await assert.rejects(service.acceptFacultyInvitation(faculty[3], { candidateId: pending.candidateId, attemptId: pendingAttempt.attemptId, meetingOptionId: options[1] }), e => e.status === 409);
  console.log('PASS mixed-generation publish-all, concurrent idempotence, cancelled outstanding invitations, atomic rollback and changed all-target manifest');

  const active = candidateFor(await currentMembers(first), 2);
  await service.sendFacultyInvitations(faculty[0], { observationId: first, candidateIds: [active.candidateId] });
  const activeAttempt = await db.invitationAttempt.findFirstOrThrow({ where: { candidateId: active.candidateId } });
  await service.acceptFacultyInvitation(faculty[2], { candidateId: active.candidateId, attemptId: activeAttempt.attemptId, meetingOptionId: options[0] });
  await service.selectFacultyObserver(faculty[0], { candidateId: active.candidateId });
  await regenerate(first); // Draft generation after a final selection leaves that assignment alone.
  const template = await db.observationTemplate.create({ data: { templateName: 'Protected work' } });
  const assessment = await db.signedAssessment.create({ data: { observationId: first, templateId: template.templateId, responses: { answers: { retained: true } } } });
  const protectedState = await snapshot();
  await assert.rejects(publish([first]), e => e.status === 409);
  await assert.rejects(regenerate(first), e => e.status === 409);
  assert.equal(await snapshot(), protectedState);
  assert.deepEqual(await db.signedAssessment.findUnique({ where: { assessmentId: assessment.assessmentId } }), assessment);
  for (const flags of [{ observerSignedAt: now }, { observeeSignedAt: now, isLocked: true }]) {
    await db.signedAssessment.update({ where: { assessmentId: assessment.assessmentId }, data: flags });
    await assert.rejects(publish([first]), e => e.status === 409);
  }
  await db.observation.update({ where: { observationId: second }, data: { status: 'COMPLETED', completedAt: now } });
  await assert.rejects(regenerate(second), e => e.status === 409);
  console.log('PASS post-selection draft preserves pairing; unsigned work, partial signatures, locking and completion block replacement without overwriting assessments');
} finally {
  await db.$disconnect(); await pool.end();
  if (created) {
    assert.match(databaseName, /^recommendations_test_[a-f0-9]{32}$/);
    assert.notEqual(databaseName, decodeURIComponent(appUrl.pathname.slice(1)));
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  }
  await admin.end();
}
