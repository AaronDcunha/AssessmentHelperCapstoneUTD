// Real PostgreSQL in a uniquely named disposable database. Never migrates/seeds the application database.
import '../configuration-loader.mjs';
import assert from 'node:assert/strict';
import { recommendationFixture } from '../recommendation-fixtures.mjs';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import ts from 'typescript';
import { PrismaPg } from '@prisma/adapter-pg';
import { facultyPermissions, acPermissions } from '../../prisma/seed-data.mjs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { PrismaClient } = await import('../../src/generated/prisma/client.ts');

const appUrl = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(appUrl.hostname)) throw new Error('Populated tests require a local database.');
appUrl.searchParams.delete('schema');
const databaseName = `faculty_test_${randomUUID().replaceAll('-', '')}`;
assert.match(databaseName, /^faculty_test_[a-f0-9]{32}$/);
const testUrl = new URL(appUrl); testUrl.pathname = `/${databaseName}`;
assert.notEqual(testUrl.pathname, appUrl.pathname);
const admin = new pg.Pool({ connectionString: appUrl.toString(), connectionTimeoutMillis: 5000 });
const pool = new pg.Pool({ connectionString: testUrl.toString(), max: 12, connectionTimeoutMillis: 5000 });
// The final DROP DATABASE ... WITH (FORCE) intentionally terminates any idle
// test connections. Keep that expected cleanup event from masking the original
// assertion error when a check fails.
pool.on('error', () => {});
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl.toString() }) });
const root = fileURLToPath(new URL('../../', import.meta.url)), require = createRequire(import.meta.url), cache = new Map();
let selectedCycle = null, selectedObservation = null, requestUser = null, sqlPool;
function load(filename) {
  const path = resolve(root, filename); if (cache.has(path)) return cache.get(path);
  const loadedModule = { exports: {} }; cache.set(path, loadedModule.exports);
  function localRequire(name) {
    if (name === 'server-only') return {};
    if (name.endsWith('.css')) return {};
    if (name === 'next/navigation') return { useRouter: () => ({ refresh() {} }) };
    if (name.endsWith('/db')) return { getPool: () => sqlPool };
    if (name.endsWith('/prisma')) return { getPrisma: () => prisma };
    if (name.endsWith('/faculty-context')) return { selectedFacultyCycle: async () => selectedCycle, selectedFacultyObservation: async () => selectedObservation };
    if (name.endsWith('/permissions')) return { getCurrentUser: async () => requestUser };
    if (!name.startsWith('.') && !name.startsWith('@/')) return require(name);
    const base = name.startsWith('@/') ? resolve(root, 'src', name.slice(2)) : resolve(dirname(path), name);
    return load(existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`);
  }
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', output)(localRequire, loadedModule, loadedModule.exports); cache.set(path, loadedModule.exports); return loadedModule.exports;
}
sqlPool = load('src/server/db.ts').facultySqlPool(pool);
const actions = load('src/server/services/faculty-actions.ts');
const invitations = load('src/server/services/faculty-invitations.ts');
const participation = load('src/server/services/faculty-participation.ts');
const attachments = load('src/server/services/faculty-attachments.ts');
const assessments = load('src/server/services/faculty-assessment.ts');
const lifecycle = load('src/server/services/observation-lifecycle.ts');
const reads = load('src/server/queries/faculty-workflow.ts');
const forms = load('src/server/queries/faculty-assessment.ts');
const dashboards = load('src/server/queries/faculty-dashboard.ts');
const configuration = load('src/server/services/configuration.ts');
const configurationReads = load('src/server/queries/configuration.ts');
const now = new Date(), day = 86400000;
const isoDate = date => date.toISOString().slice(0, 10);
const tomorrow = new Date(now.getTime() + day), meetingDate = isoDate(tomorrow);
const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${meetingDate}T12:00:00Z`));
const cycleId = randomUUID(), semesterId = randomUUID(), courseId = randomUUID(), departmentId = randomUUID(), levelId = randomUUID();
const faculty = [], sections = [];
const committee = { id: randomUUID(), permissions: [...facultyPermissions, ...acPermissions] };
let created = false, checks = 0;
const privateDirectory = await mkdtemp(resolve(tmpdir(), 'faculty_files_test_'));
process.env.FACULTY_ATTACHMENT_DIR = privateDirectory;
const checked = label => { checks++; console.log(`PASS ${label}`); };
try {
  await admin.query(`CREATE DATABASE "${databaseName}"`); created = true;
  const migrations = (await readdir(new URL('../../prisma/migrations/', import.meta.url), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  for (const name of migrations) {
    if (name === '20261026000000_faculty_workflows') await pool.query("INSERT INTO app_user(user_id,full_name,email) VALUES ($1,'Retained legacy fixture','retained@isolated.test')", [randomUUID()]);
    await pool.query(await readFile(new URL(`../../prisma/migrations/${name}/migration.sql`, import.meta.url), 'utf8'));
  }
  assert.equal(await prisma.appUser.count({ where: { email: 'retained@isolated.test' } }), 1); checked('additive migrations preserve existing records');
  await prisma.appUser.create({ data: { userId: committee.id, fullName: 'Committee', email: 'committee@isolated.test' } });
  const permission = await prisma.permission.create({ data: { permissionName: 'late-acceptance.review' } });
  const role = await prisma.role.create({ data: { roleName: 'AC', rolePermissions: { create: { permissionId: permission.permissionId } } } });
  await prisma.userRole.create({ data: { userId: committee.id, roleId: role.roleId } });
  await prisma.department.create({ data: { departmentId, departmentName: 'Isolated' } });
  await prisma.hiringLevel.create({ data: { hiringLevelId: levelId, levelName: 'Assistant Professor', evaluationIntervalYears: 1 } });
  await prisma.semester.create({ data: { semesterId, termCode: `${String(now.getUTCFullYear()).slice(2)}f`, termName: 'Isolated current term', startsOn: new Date(now.getTime() - 60 * day), endsOn: new Date(now.getTime() + 60 * day), timeZone: 'America/Chicago' } });
  await prisma.evaluationCycle.create({ data: { cycleId, semesterId, cycleName: 'Isolated current cycle', signupDeadline: new Date(now.getTime() + day), observationDeadline: new Date(now.getTime() + 10 * day), feedbackDeadline: new Date(now.getTime() + 20 * day) } });
  await prisma.course.create({ data: { courseId, departmentId, courseCode: 'TEST1000', courseTitle: 'Isolated course', courseLevel: 1000 } });
  const initialTemplate = await configuration.createTemplate(prisma, committee, { title: 'Initial published form', criteria: [{ key: 'initial-rating', prompt: 'Initial evidence', type: 'rating', required: true, order: 0, options: [{ value: 1, label: 'Needs support' }, { value: 2, label: 'Meets expectations' }] }] });
  await configuration.publishTemplate(prisma, committee, initialTemplate.id, { expectedRevision: 0 });
  for (let index = 0; index < 6; index++) {
    const id = randomUUID(), professorId = randomUUID(), sectionId = randomUUID();
    const user = { id, name: `Faculty ${index}`, username: `fixture_${index}`, roles: ['Faculty'], permissions: [...facultyPermissions] };
    faculty.push(user); sections.push(sectionId);
    await prisma.appUser.create({ data: { userId: id, fullName: user.name, email: `${index}@isolated.test` } });
    await prisma.professor.create({ data: { professorId, userId: id, departmentId, hiringLevelId: levelId, hireDate: index === 4 ? new Date(now.getTime() - day) : index === 5 ? null : new Date('2020-01-01') } });
    await prisma.courseSection.create({ data: { sectionId, semesterId, courseId, sectionCode: String(index), teaches: { create: { professorId } }, classMeetings: { create: { dayOfWeek: weekday, startTime: index === 1 ? '14:00' : index === 2 ? '16:00' : '10:00', endTime: index === 1 ? '15:00' : index === 2 ? '17:00' : '11:00', location: 'Isolated classroom' } } } });
  }
  let workspace = await reads.getFacultyWorkflow(faculty[0]);
  assert.equal(workspace.signup.allowed, true); assert.equal(workspace.dashboard.evaluation.status, 'due');
  assert.equal((await reads.getFacultyWorkflow(faculty[4])).dashboard.evaluation.status, 'ineligible');
  assert.equal((await reads.getFacultyWorkflow(faculty[5])).signup.allowed, false);
  await assert.rejects(actions.submitFacultySignup(faculty[0], { sectionId: sections[1], dates: [meetingDate] }));
  await assert.rejects(actions.submitFacultySignup({ ...faculty[0], permissions: [] }, { sectionId: sections[0], dates: [meetingDate] }));
  const duplicate = await Promise.allSettled([0, 1].map(() => actions.submitFacultySignup(faculty[0], { sectionId: sections[0], dates: [meetingDate] })));
  assert.equal(duplicate.filter(result => result.status === 'fulfilled').length, 1);
  for (let i = 1; i < 4; i++) await actions.submitFacultySignup(faculty[i], { sectionId: sections[i], dates: [meetingDate] });
  const ownRecord = await prisma.observation.findFirst({ where: { signup: { professor: { userId: faculty[0].id } } } });
  const otherRecord = await prisma.observation.findFirst({ where: { signup: { professor: { userId: faculty[3].id } } } });
  checked('eligibility, ownership, permission checks and concurrent duplicate signup');
  const extraSemester = await prisma.semester.create({ data: { termCode: `${String(now.getUTCFullYear() + 1).slice(2)}s`, termName: 'Isolated next term', timeZone: 'America/Chicago' } });
  const extraCycle = await prisma.evaluationCycle.create({ data: { semesterId: extraSemester.semesterId, cycleName: 'Isolated future cycle', signupDeadline: new Date(now.getTime() + 30 * day), observationDeadline: new Date(now.getTime() + 40 * day), feedbackDeadline: new Date(now.getTime() + 50 * day) } });
  const sourceProfile = await prisma.professor.findUnique({ where: { userId: faculty[0].id } });
  await prisma.courseSection.create({ data: { courseId, semesterId: extraSemester.semesterId, sectionCode: 'future', teaches: { create: { professorId: sourceProfile.professorId } } } });
  assert.equal((await dashboards.getFacultyDashboard(faculty[0])).cycle, null);
  selectedCycle = cycleId;
  assert.equal((await dashboards.getFacultyDashboard(faculty[0])).cycle.id, cycleId);
  assert.equal((await dashboards.getFacultyDashboard(faculty[1], { cycleId: extraCycle.cycleId })).cycle, null);
  checked('relevant-cycle ambiguity and explicit selection without foreign-cycle access');
  await assert.rejects(invitations.generateRecommendations(faculty[0], cycleId));
  await assert.rejects(invitations.generateRecommendations(committee, cycleId));
  await configuration.updateCycle(prisma, committee, cycleId, { expectedRevision: 0, signupDeadline: new Date(now.getTime() - 3600000).toISOString() });
  await assert.rejects(actions.submitFacultySignup(faculty[5], { sectionId: sections[5], dates: [meetingDate] }));
  const priorGeneration = await invitations.generateRecommendations(committee, cycleId, {scope:{observationIds:[ownRecord.observationId]}});
  assert.equal((await prisma.observation.findUnique({where:{observationId:otherRecord.observationId}})).currentDraftListId,null);
  const listsBeforeInvalidSelection = await prisma.recommendationList.count();
  await assert.rejects(invitations.generateRecommendations(committee, cycleId, {scope:{observationIds:[ownRecord.observationId,randomUUID()]}}),error=>error.status===409);
  assert.equal(await prisma.recommendationList.count(),listsBeforeInvalidSelection);
  const priorCandidateIds = (await prisma.observationCandidate.findMany()).map(candidate => candidate.candidateId);
  const generation = await invitations.generateRecommendations(committee, cycleId);
  assert.equal(await prisma.observationCandidate.count({ where: { candidateId: { in: priorCandidateIds } } }), priorCandidateIds.length);
  await assert.rejects(invitations.releaseRecommendations(committee, cycleId, { generationId: priorGeneration.generationId }), error => error.status === 404);
  assert.ok(generation.generatedCount > 0);
  assert.equal((await reads.getFacultyWorkflow(faculty[0])).links.recommendations.length, 0);
  // An invalid final target rolls back all earlier publications and notifications.
  const drafts = await prisma.observation.findMany({ where: { cycleId }, orderBy: { observationId: 'asc' } });
  const lastDraftId = drafts.at(-1).currentDraftListId;
  await prisma.recommendationList.update({ where: { listId: lastDraftId }, data: { publishedAt: now } });
  const noticeCount = await prisma.notification.count();
  await assert.rejects(invitations.releaseRecommendations(committee, cycleId, { generationId: generation.generationId }), error => error.status === 409);
  assert.equal(await prisma.observation.count({ where: { cycleId, currentReleasedListId: { not: null } } }), 0);
  assert.equal(await prisma.notification.count(), noticeCount);
  await prisma.recommendationList.update({ where: { listId: lastDraftId }, data: { publishedAt: null } });
  await invitations.releaseRecommendations(committee, cycleId, { generationId: generation.generationId });
  const notifications = await prisma.notification.count();
  await invitations.releaseRecommendations(committee, cycleId, { generationId: generation.generationId });
  assert.equal(await prisma.notification.count(), notifications);
  workspace = await reads.getFacultyWorkflow(faculty[0]);
  assert.ok(workspace.links.recommendations.length >= 2);
  const releasedScope = load('src/server/recommendation-scope.ts').currentReleasedCandidates;
  const candidates = await prisma.observationCandidate.findMany({ where: { ...releasedScope, observationId: ownRecord.observationId }, include: { professor: true } });
  const c1 = candidates.find(candidate => candidate.professor.userId === faculty[1].id), c2 = candidates.find(candidate => candidate.professor.userId === faculty[2].id);
  assert.ok(c1 && c2);
  // Seed a replacement draft/history directly to verify the foundation, without
  // enabling a public replacement-generation/publication workflow.
  const draftList = await recommendationFixture(prisma, ownRecord.observationId);
  const historicalList = await prisma.recommendationList.create({ data: { observationId: ownRecord.observationId, publishedAt: new Date(now.getTime() - day) } });
  const draftMember = await prisma.observationCandidate.create({ data: { observationId: ownRecord.observationId, recommendationListId: draftList.listId, professorId: c1.professorId, status: 'PENDING', invitedAt: now, expiresAt: new Date(now.getTime() + day) } });
  const historicalMember = await prisma.observationCandidate.create({ data: { observationId: ownRecord.observationId, recommendationListId: historicalList.listId, professorId: c2.professorId, status: 'PENDING', invitedAt: new Date(now.getTime() - day), expiresAt: new Date(now.getTime() - 1000) } });
  const inactiveAttempts = [];
  for (const member of [draftMember, historicalMember]) inactiveAttempts.push(await prisma.invitationAttempt.create({ data: { candidateId: member.candidateId, number: 1, invitedAt: member.invitedAt, expiresAt: member.expiresAt } }));
  const supersededApproval = await prisma.lateAcceptanceApproval.create({ data: { attemptId: inactiveAttempts[1].attemptId } });
  const inactiveIds = [draftMember.candidateId, historicalMember.candidateId];
  const inactiveSnapshot = async () => JSON.stringify(await Promise.all([
    prisma.observationCandidate.findMany({ where: { candidateId: { in: inactiveIds } }, orderBy: { candidateId: 'asc' } }),
    prisma.invitationAttempt.findMany({ where: { candidateId: { in: inactiveIds } }, orderBy: { attemptId: 'asc' } }),
    prisma.lateAcceptanceApproval.findUnique({ where: { approvalId: supersededApproval.approvalId } }),
  ]));
  const inactiveBefore = await inactiveSnapshot();
  const isolatedWorkspace = await reads.getFacultyWorkflow(faculty[0]);
  assert.deepEqual(new Set(isolatedWorkspace.links.recommendations.map(item => item.id)), new Set(candidates.map(item => item.candidateId)));
  for (const [member, attempt, recipient] of [[draftMember, inactiveAttempts[0], faculty[1]], [historicalMember, inactiveAttempts[1], faculty[2]]]) {
    const received = await reads.getFacultyWorkflow(recipient);
    assert.ok(!received.links.requests.some(item => inactiveIds.includes(item.id)));
    assert.ok(!received.requests.some(item => inactiveIds.includes(item.id)));
    assert.equal(received.dashboard.pendingObserverRequestCount, 0);
    await assert.rejects(invitations.sendFacultyInvitations(faculty[0], { observationId: ownRecord.observationId, candidateIds: [member.candidateId] }), error => error.status === 409);
    await assert.rejects(invitations.declineFacultyInvitation(recipient, { candidateId: member.candidateId, attemptId: attempt.attemptId }), error => error.status === 409);
    await assert.rejects(invitations.acceptFacultyInvitation(recipient, { candidateId: member.candidateId, attemptId: attempt.attemptId, meetingOptionId: randomUUID() }), error => error.status === 409);
    await assert.rejects(invitations.selectFacultyObserver(faculty[0], { candidateId: member.candidateId }), error => error.status === 409);
    await assert.rejects(invitations.requestLateAcceptance(recipient, { candidateId: member.candidateId, attemptId: attempt.attemptId }), error => error.status === 409);
  }
  await assert.rejects(invitations.reviewLateAcceptance(committee, supersededApproval.approvalId, { decision: 'approved' }), error => error.status === 409);
  requestUser = committee;
  const approvalRoute = load('src/app/api/evaluation-cycles/[cycleId]/expired-acceptance-requests/route.ts');
  const approvalResponse = await approvalRoute.GET(new Request('http://local/approvals'), { params: Promise.resolve({ cycleId }) });
  assert.equal(approvalResponse.status, 200);
  assert.ok(!(await approvalResponse.json()).items.some(item => item.approvalId === supersededApproval.approvalId));
  requestUser = null;
  await assert.rejects(invitations.releaseRecommendations(committee, cycleId, { generationId: generation.generationId, observationIds: [ownRecord.observationId] }), error => error.status === 409);
  await invitations.processFacultyInvitationExpiry();
  assert.equal(await inactiveSnapshot(), inactiveBefore);
  assert.equal((await invitations.generateRecommendations(committee, cycleId)).generatedCount, 0);
  const futureSection = await prisma.courseSection.findFirst({ where: { semesterId: extraSemester.semesterId } });
  const futureSignup = await prisma.evaluationSignup.create({ data: { cycleId: extraCycle.cycleId, professorId: sourceProfile.professorId, sectionId: futureSection.sectionId } });
  const futureObservation = await prisma.observation.create({ data: { cycleId: extraCycle.cycleId, signupId: futureSignup.signupId } });
  const futureDraft = await recommendationFixture(prisma, futureObservation.observationId);
  const isolatedProfessor = await prisma.professor.findUnique({ where: { userId: faculty[5].id } });
  await prisma.observationCandidate.create({ data: { observationId: futureObservation.observationId, recommendationListId: futureDraft.listId, professorId: isolatedProfessor.professorId } });
  assert.ok(!(await configurationReads.getRelevantFacultyCycles(prisma, faculty[5], now)).some(cycle => cycle.cycleId === extraCycle.cycleId));
  checked('versioned membership isolation, preserved initial drafts, atomic release rollback and disabled replacement workflows');
  await assert.rejects(invitations.sendFacultyInvitations(faculty[3], { observationId: ownRecord.observationId, candidateIds: [c1.candidateId] }));
  await invitations.sendFacultyInvitations(faculty[0], { observationId: ownRecord.observationId, candidateIds: [c1.candidateId, c2.candidateId] });
  await invitations.sendFacultyInvitations(faculty[0], { observationId: ownRecord.observationId, candidateIds: [c1.candidateId] });
  assert.equal(await prisma.invitationAttempt.count({ where: { candidateId: c1.candidateId } }), 1);
  checked('matching, release privacy/idempotence, sending and preserved 48-hour attempt windows');
  const { FacultyCandidates } = load('src/components/observations/faculty-candidates.tsx');
  const { RequestsScreen } = load('src/components/observations/faculty-screens.tsx');
  const candidateHtml = renderToStaticMarkup(createElement(FacultyCandidates, { data: workspace }));
  assert.ok(candidateHtml.includes(faculty[1].name)); assert.ok(candidateHtml.includes('Send Requests'));
  const requestWorkspace = await reads.getFacultyWorkflow(faculty[1]);
  assert.ok(requestWorkspace.links.requests.some(request => request.options.length));
  const requestHtml = renderToStaticMarkup(createElement(RequestsScreen, { data: requestWorkspace }));
  assert.ok(requestHtml.includes('Accept selected date')); assert.ok(requestHtml.includes('America/Chicago'));
  checked('populated Faculty recommendation and invitation screens render real names and meeting options');
  const options = await prisma.observationTimeOption.findMany({ where: { observationId: ownRecord.observationId } });
  const attempt1 = await prisma.invitationAttempt.findFirst({ where: { candidateId: c1.candidateId } });
  const attempt2 = await prisma.invitationAttempt.findFirst({ where: { candidateId: c2.candidateId } });
  const foreignOption = await prisma.observationTimeOption.findFirst({ where: { observationId: otherRecord.observationId } });
  await assert.rejects(invitations.acceptFacultyInvitation(faculty[1], { candidateId: c1.candidateId, meetingOptionId: foreignOption.timeOptionId, attemptId: attempt1.attemptId }));
  await assert.rejects(invitations.acceptFacultyInvitation(faculty[2], { candidateId: c1.candidateId, meetingOptionId: options[0].timeOptionId, attemptId: attempt1.attemptId }));
  const payload1 = { candidateId: c1.candidateId, meetingOptionId: options[0].timeOptionId, attemptId: attempt1.attemptId };
  const acceptance = await Promise.allSettled([invitations.acceptFacultyInvitation(faculty[1], payload1), invitations.acceptFacultyInvitation(faculty[1], payload1)]);
  assert.ok(acceptance.some(result => result.status === 'fulfilled'));
  await invitations.acceptFacultyInvitation(faculty[2], { candidateId: c2.candidateId, meetingOptionId: options[0].timeOptionId, attemptId: attempt2.attemptId });
  const acceptedWorkspace = await reads.getFacultyWorkflow(faculty[0]);
  const acceptedMeeting = acceptedWorkspace.links.recommendations.find(c => c.id === c1.candidateId).acceptedMeeting;
  assert.deepEqual(acceptedMeeting, { startsAt: options[0].startsAt.toISOString(), endsAt: options[0].endsAt.toISOString(), timeZone: options[0].timeZone });
  const acceptedHtml = renderToStaticMarkup(createElement(FacultyCandidates, { data: acceptedWorkspace, accepted: true }));
  assert.ok(acceptedHtml.includes('America/Chicago'));
  const meetingFormatter = new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: acceptedMeeting.timeZone });
  assert.ok(acceptedHtml.includes(meetingFormatter.format(new Date(acceptedMeeting.endsAt))));
  const pairing = await Promise.allSettled([c1, c2].map(candidate => invitations.selectFacultyObserver(faculty[0], { candidateId: candidate.candidateId })));
  assert.equal(pairing.filter(result => result.status === 'fulfilled').length, 1);
  const paired = await prisma.observation.findUnique({ where: { observationId: ownRecord.observationId } });
  assert.equal(paired.status, 'CONFIRMED'); assert.ok(paired.scheduledAt); assert.ok(paired.scheduledEndsAt);
  assert.equal(await prisma.observationCandidate.count({ where: { observationId: paired.observationId, status: 'SELECTED' } }), 1);
  assert.equal(await prisma.observationCandidate.count({ where: { ...releasedScope, observationId: paired.observationId, status: { in: ['ACCEPTED', 'PENDING'] } } }), 0);
  assert.equal(await inactiveSnapshot(), inactiveBefore);
  checked('acceptance ownership/options, concurrent actions, final pairing and atomic cancellation');
  const winner = await prisma.professor.findUnique({ where: { professorId: paired.observerId } });
  const observer = faculty.find(user => user.id === winner.userId);
  // Two different parents competing for the same observer/meeting must not double-book.
  const freeObserver = faculty[1].id === observer.id ? faculty[2] : faculty[1];
  const freeProfile = await prisma.professor.findUnique({ where: { userId: freeObserver.id } });
  const originalOtherOption = await prisma.observationTimeOption.findFirst({ where: { observationId: otherRecord.observationId } });
  const competing = await prisma.observation.create({ data: { signupId: otherRecord.signupId, cycleId, recommendationsReleasedAt: new Date(), status: 'PENDING', timeOptions: { create: { preferredDate: new Date(meetingDate) } } }, include: { timeOptions: true } });
  const competingList = await recommendationFixture(prisma, competing.observationId, { released: true });
  const competingCandidate = await prisma.observationCandidate.create({ data: { observationId: competing.observationId, recommendationListId: competingList.listId, professorId: freeProfile.professorId } });
  const otherCandidate = await prisma.observationCandidate.findFirst({ where: { ...releasedScope, observationId: otherRecord.observationId, professorId: freeProfile.professorId } });
  for (const [record, candidate, option] of [[otherRecord, otherCandidate, originalOtherOption], [competing, competingCandidate, competing.timeOptions[0]]]) {
    await invitations.sendFacultyInvitations(faculty[3], { observationId: record.observationId, candidateIds: [candidate.candidateId] });
    const attempt = await prisma.invitationAttempt.findFirst({ where: { candidateId: candidate.candidateId }, orderBy: { number: 'desc' } });
    await invitations.acceptFacultyInvitation(freeObserver, { candidateId: candidate.candidateId, meetingOptionId: option.timeOptionId, attemptId: attempt.attemptId });
  }
  const overlapping = await Promise.allSettled([otherCandidate, competingCandidate].map(candidate => invitations.selectFacultyObserver(faculty[3], { candidateId: candidate.candidateId })));
  assert.equal(overlapping.filter(result => result.status === 'fulfilled').length, 1);
  checked('concurrent final pairing across different observations prevents observer double-booking');
  // Fresh parent records use existing signups solely as isolated fixtures.
  async function freshInvitation(sourceIndex, targetIndex, extraTargetIndex) {
    const signup = await prisma.evaluationSignup.findFirst({ where: { professor: { userId: faculty[sourceIndex].id }, cycleId } });
    const record = await prisma.observation.create({ data: { signupId: signup.signupId, cycleId, recommendationsReleasedAt: new Date(), status: 'PENDING', timeOptions: { create: { preferredDate: new Date(meetingDate) } } }, include: { timeOptions: true } });
    const list = await recommendationFixture(prisma, record.observationId, { released: true });
    const target = await prisma.professor.findUnique({ where: { userId: faculty[targetIndex].id } });
    const candidate = await prisma.observationCandidate.create({ data: { observationId: record.observationId, recommendationListId: list.listId, professorId: target.professorId } });
    let extra;
    if (extraTargetIndex !== undefined) {
      const profile = await prisma.professor.findUnique({ where: { userId: faculty[extraTargetIndex].id } });
      extra = await prisma.observationCandidate.create({ data: { observationId: record.observationId, recommendationListId: list.listId, professorId: profile.professorId } });
    }
    await invitations.sendFacultyInvitations(faculty[sourceIndex], { observationId: record.observationId, candidateIds: [candidate.candidateId] });
    return { record, candidate, extra, attempt: await prisma.invitationAttempt.findFirst({ where: { candidateId: candidate.candidateId } }) };
  }
  async function expire(candidateId) {
    const latest = await prisma.invitationAttempt.findFirst({ where: { candidateId }, orderBy: { number: 'desc' } });
    const invitedAt = new Date(now.getTime() - 4 * 3600000), expiresAt = new Date(now.getTime() - 1000);
    await prisma.invitationAttempt.update({ where: { attemptId: latest.attemptId }, data: { invitedAt, expiresAt } });
    await prisma.observationCandidate.update({ where: { candidateId }, data: { invitedAt, expiresAt } });
    return latest;
  }
  const late = await freshInvitation(1, 2);
  await expire(late.candidate.candidateId);
  const latePayload = { candidateId: late.candidate.candidateId, attemptId: late.attempt.attemptId, meetingOptionId: late.record.timeOptions[0].timeOptionId };
  await assert.rejects(invitations.acceptFacultyInvitation(faculty[2], latePayload));
  await invitations.requestLateAcceptance(faculty[2], { candidateId: latePayload.candidateId, attemptId: latePayload.attemptId });
  await invitations.requestLateAcceptance(faculty[2], { candidateId: latePayload.candidateId, attemptId: latePayload.attemptId });
  const approval = await prisma.lateAcceptanceApproval.findUnique({ where: { attemptId: latePayload.attemptId } });
  await assert.rejects(invitations.reviewLateAcceptance(faculty[2], approval.approvalId, { decision: 'approved' }));
  const approvals = await Promise.allSettled([0, 1].map(() => invitations.reviewLateAcceptance(committee, approval.approvalId, { decision: 'approved' })));
  assert.equal(approvals.filter(result => result.status === 'fulfilled').length, 1);
  await assert.rejects(invitations.acceptFacultyInvitation(faculty[2], latePayload));
  const reopened = await prisma.invitationAttempt.findFirst({ where: { candidateId: latePayload.candidateId }, orderBy: { number: 'desc' } });
  await invitations.acceptFacultyInvitation(faculty[2], { ...latePayload, attemptId: reopened.attemptId });
  await invitations.selectFacultyObserver(faculty[1], { candidateId: latePayload.candidateId });
  await assert.rejects(participation.reportFacultyIssue(faculty[1], { observationId: late.record.observationId, kind: 'NOT_OCCURRED', reason: 'Did not happen', details: '' }));
  await prisma.observation.update({ where: { observationId: late.record.observationId }, data: { scheduledAt: new Date(now.getTime() - 3600000), scheduledEndsAt: new Date(now.getTime() - 1800000) } });
  await assert.rejects(participation.reportFacultyIssue(faculty[3], { observationId: late.record.observationId, kind: 'NOT_OCCURRED', reason: 'Foreign', details: '' }));
  await participation.reportFacultyIssue(faculty[2], { observationId: late.record.observationId, kind: 'NOT_OCCURRED', reason: 'Class cancelled', details: 'Isolated fixture' });
  assert.equal((await prisma.observation.findUnique({ where: { observationId: late.record.observationId } })).status, 'NOT_OCCURRED');
  checked('expired acceptance, idempotent approval requests, concurrent AC decisions, superseded windows and non-occurrence reporting');
  const declined = await freshInvitation(2, 1);
  const declinePayload = { candidateId: declined.candidate.candidateId, attemptId: declined.attempt.attemptId };
  await assert.rejects(invitations.declineFacultyInvitation(faculty[0], declinePayload));
  await invitations.declineFacultyInvitation(faculty[1], declinePayload);
  assert.equal((await prisma.invitationAttempt.findUnique({ where: { attemptId: declinePayload.attemptId } })).status, 'DECLINED');
  assert.equal((await prisma.observationCandidate.findUnique({ where: { candidateId: declinePayload.candidateId } })).status, 'DECLINED');
  await assert.rejects(invitations.declineFacultyInvitation(faculty[1], declinePayload));
  checked('decline validates ownership/window and updates candidate, attempt and notification atomically');
  const automatic = await freshInvitation(2, 1, 0);
  await participation.reportFacultyIssue(faculty[2], { observationId: automatic.record.observationId, kind: 'ALERT', reason: 'List question', details: 'Need assistance', creationKey:automatic.record.observationId });
  await participation.reportFacultyIssue(faculty[2], { observationId: automatic.record.observationId, kind: 'ALERT', reason: 'List question', details: 'Need assistance', creationKey:automatic.record.observationId });
  assert.equal(await prisma.facultyIssue.count({ where: { observationId: automatic.record.observationId, kind: 'ALERT' } }), 1);
  await expire(automatic.candidate.candidateId);
  await invitations.processFacultyInvitationExpiry();
  assert.equal(await prisma.invitationAttempt.count({ where: { candidateId: automatic.candidate.candidateId } }), 1);
  assert.equal(await prisma.invitationAttempt.count({ where: { candidateId: automatic.extra.candidateId } }), 1);
  await expire(automatic.extra.candidateId);
  await invitations.processFacultyInvitationExpiry();
  assert.equal(await prisma.invitationAttempt.count({ where: { candidateId: automatic.candidate.candidateId } }), 2);
  assert.equal(await prisma.invitationAttempt.count({ where: { candidateId: automatic.extra.candidateId } }), 2);
  await expire(automatic.candidate.candidateId); await expire(automatic.extra.candidateId);
  await invitations.processFacultyInvitationExpiry(); await invitations.processFacultyInvitationExpiry();
  assert.equal(await prisma.invitationAttempt.count({ where: { candidateId: { in: [automatic.candidate.candidateId, automatic.extra.candidateId] } } }), 4);
  checked('automatic expiry, uncontacted-candidate priority, bounded resends, repeatable jobs and deduplicated committee alerts');
  selectedObservation = paired.observationId;
  assert.ok((await prisma.observation.findUniqueOrThrow({ where: { observationId: paired.observationId } })).scheduledAt > new Date(), 'Assessment workflow is tested before the proposed appointment');
  const template = await configuration.createTemplate(prisma, committee, { title: 'Sparse scale', criteria: [{ key: 'rating', prompt: 'Evidence of learning', type: 'rating', required: true, order: 0, options: [{ value: 0, label: 'Needs support' }, { value: 10, label: 'Excellent' }] }], commentPrompts: [{ prompt: 'Evidence', required: true, order: 0 }] });
  await configuration.publishTemplate(prisma, committee, template.id, { expectedRevision: 0 });
  assert.equal((await prisma.observation.findUniqueOrThrow({ where: { observationId: paired.observationId } })).assignedTemplateId, initialTemplate.id, 'Publishing a new template does not switch an existing observation');
  const archivedAssigned = await configuration.deleteTemplate(prisma, committee, initialTemplate.id, { expectedRevision: 1 });
  assert.equal(archivedAssigned.archived, true);
  assert.equal((await forms.getFacultyAssessment(observer)).templateId, initialTemplate.id, 'An assigned form remains readable after its live template is archived');

  const unusedDraft = await configuration.createTemplate(prisma, committee, { title: 'Unused draft', criteria: [{ key: 'unused', prompt: 'Unused question', type: 'text', required: false, order: 0 }] });
  const unusedDeletion = await configuration.deleteTemplate(prisma, committee, unusedDraft.id, { expectedRevision: 0 });
  assert.equal(unusedDeletion.deleted, true); assert.equal(await prisma.observationTemplate.findUnique({ where: { templateId: unusedDraft.id } }), null);
  const archivable = await configuration.createTemplate(prisma, committee, { title: 'Archivable form', criteria: [{ key: 'archive', prompt: 'Archived question', type: 'text', required: false, order: 0 }] });
  const publishedArchivable = await configuration.publishTemplate(prisma, committee, archivable.id, { expectedRevision: 0 });
  const archival = await configuration.deleteTemplate(prisma, committee, archivable.id, { expectedRevision: publishedArchivable.revision });
  assert.equal(archival.archived, true);
  assert.equal((await configurationReads.getTemplate(prisma, committee, archivable.id)).status, 'archived');
  const restoredArchivable = await configuration.unarchiveTemplate(prisma, committee, archivable.id, { expectedRevision: archival.revision });
  assert.equal(restoredArchivable.status, 'draft');
  const republishedArchivable = await configuration.publishTemplate(prisma, committee, archivable.id, { expectedRevision: restoredArchivable.revision });
  assert.equal(republishedArchivable.status, 'published');
  checked('unused draft deletion, published archival, archived readability, unarchive and explicit republish');

  // Observation-only deletion keeps the signup and replaces its observation,
  // while clearing every piece of unfinished workflow data from the old one.
  const lifecycleObservee = await prisma.professor.findUniqueOrThrow({ where: { userId: faculty[4].id } });
  const lifecycleObserver = await prisma.professor.findUniqueOrThrow({ where: { userId: faculty[5].id } });
  const editableTemplate = await configuration.createTemplate(prisma, committee, { title: 'Editable unfinished form', criteria: [{ key: 'rating', prompt: 'Original editable prompt', type: 'rating', required: true, order: 0, options: [{ value: 0, label: 'Needs support' }, { value: 10, label: 'Excellent' }] }] });
  await configuration.publishTemplate(prisma, committee, editableTemplate.id, { expectedRevision: 0 });
  const lifecycleSignup = await prisma.evaluationSignup.create({ data: { cycleId, professorId: lifecycleObservee.professorId, sectionId: sections[4] } });
  const lifecycleObservation = await prisma.observation.create({ data: { cycleId, signupId: lifecycleSignup.signupId, assignedTemplateId: editableTemplate.id,
    timeOptions: { create: { preferredDate: tomorrow, startsAt: new Date(`${meetingDate}T10:00:00Z`), endsAt: new Date(`${meetingDate}T11:00:00Z`), timeZone: 'America/Chicago', location: 'Lifecycle room' } } }, include: { timeOptions: true } });
  const lifecycleList = await prisma.recommendationList.create({ data: { observationId: lifecycleObservation.observationId, generationId: randomUUID(), generatedAt: now } });
  const lifecycleCandidate = await prisma.observationCandidate.create({ data: { observationId: lifecycleObservation.observationId, recommendationListId: lifecycleList.listId, professorId: lifecycleObserver.professorId, status: 'PENDING' } });
  const lifecycleAttempt = await prisma.invitationAttempt.create({ data: { candidateId: lifecycleCandidate.candidateId, number: 1, invitedAt: now, expiresAt: new Date(now.getTime() + day) } });
  await prisma.observation.update({ where: { observationId: lifecycleObservation.observationId }, data: { currentDraftListId: lifecycleList.listId } });
  await prisma.signedAssessment.create({ data: { observationId: lifecycleObservation.observationId, templateId: editableTemplate.id, responses: { answers: { [editableTemplate.criteria[0].id]: 0 }, comments: 'unfinished', promptAnswers: {} } } });
  const lifecycleFeedback = await prisma.processFeedback.create({ data: { observationId: lifecycleObservation.observationId, professorId: lifecycleObservee.professorId, feedbackRole: 'OBSERVEE', satisfaction: 3 } });
  const lifecycleAttachment = await prisma.feedbackAttachment.create({ data: { ownerId: faculty[4].id, observationId: lifecycleObservation.observationId, feedbackId: lifecycleFeedback.feedbackId, originalName: 'unfinished.pdf', contentType: 'application/pdf', sizeBytes: 10, storageKey: randomUUID() } });
  const lifecycleNotification = await prisma.notification.create({ data: { userId: faculty[4].id, title: 'Unfinished workflow', message: 'Will be detached', notificationType: 'TEST', targetKind: 'observation', targetId: lifecycleObservation.observationId, eventKey: `lifecycle:${lifecycleObservation.observationId}` } });
  const compatibleEdit = await configuration.updateTemplate(prisma, committee, editableTemplate.id, { expectedRevision: 1, criteria: [{ id: editableTemplate.criteria[0].id, key: 'rating', prompt: 'Compatible prompt edit', type: 'rating', required: true, order: 0, options: [{ value: 0, label: 'Needs support' }, { value: 10, label: 'Excellent' }] }] });
  assert.equal((await prisma.signedAssessment.findUniqueOrThrow({ where: { observationId: lifecycleObservation.observationId } })).responses.answers[editableTemplate.criteria[0].id], 0);
  const incompatibleEdit = { expectedRevision: compatibleEdit.revision, criteria: [{ id: editableTemplate.criteria[0].id, key: 'rating', prompt: 'Incompatible scale edit', type: 'rating', required: true, order: 0, options: [{ value: 1, label: 'Low' }, { value: 2, label: 'High' }] }] };
  await assert.rejects(configuration.updateTemplate(prisma, committee, editableTemplate.id, incompatibleEdit), error => error.code === 'TEMPLATE_IMPACT_CONFIRMATION_REQUIRED');
  await configuration.updateTemplate(prisma, committee, editableTemplate.id, { ...incompatibleEdit, confirmImpact: true });
  const archivedEditAssessment = await prisma.signedAssessment.findUniqueOrThrow({ where: { observationId: lifecycleObservation.observationId } });
  assert.deepEqual(archivedEditAssessment.responses.answers, {}); assert.equal(archivedEditAssessment.responseArchive.length, 1);
  await prisma.signedAssessment.update({ where: { observationId: lifecycleObservation.observationId }, data: { responses: { answers: { [editableTemplate.criteria[0].id]: 1 }, comments: 'unfinished', promptAnswers: {} } } });
  const compatibleTemplate = await configuration.createTemplate(prisma, committee, { title: 'Compatible reassignment', criteria: [{ key: 'rating', prompt: 'Updated evidence prompt', type: 'rating', required: true, order: 0, options: [{ value: 1, label: 'Low' }, { value: 2, label: 'High' }] }] });
  await configuration.publishTemplate(prisma, committee, compatibleTemplate.id, { expectedRevision: 0 });
  const compatibleReassignment = await lifecycle.reassignObservationTemplate(committee, lifecycleObservation.observationId, { templateId: compatibleTemplate.id, expectedRevision: 0 });
  assert.equal(compatibleReassignment.archivedResponseCount, 0);
  const compatibleAssessment = await prisma.signedAssessment.findUniqueOrThrow({ where: { observationId: lifecycleObservation.observationId } });
  assert.equal(compatibleAssessment.responses.answers[compatibleTemplate.criteria[0].id], 1);
  const incompatibleTemplate = await configuration.createTemplate(prisma, committee, { title: 'Incompatible reassignment', criteria: [{ key: 'rating', prompt: 'Changed scale', type: 'rating', required: true, order: 0, options: [{ value: 3, label: 'Low' }, { value: 4, label: 'High' }] }] });
  await configuration.publishTemplate(prisma, committee, incompatibleTemplate.id, { expectedRevision: 0 });
  await assert.rejects(lifecycle.reassignObservationTemplate(committee, lifecycleObservation.observationId, { templateId: incompatibleTemplate.id, expectedRevision: compatibleReassignment.revision }), /Confirm the reassignment/);
  const incompatibleReassignment = await lifecycle.reassignObservationTemplate(committee, lifecycleObservation.observationId, { templateId: incompatibleTemplate.id, expectedRevision: compatibleReassignment.revision, confirmImpact: true });
  assert.equal(incompatibleReassignment.archivedResponseCount, 1);
  const incompatibleAssessment = await prisma.signedAssessment.findUniqueOrThrow({ where: { observationId: lifecycleObservation.observationId } });
  assert.equal(incompatibleAssessment.responses.answers[compatibleTemplate.criteria[0].id], undefined);
  assert.equal(incompatibleAssessment.responseArchive.length, 2);
  await assert.rejects(lifecycle.deleteObservation(faculty[4], lifecycleObservation.observationId, { expectedRevision: 0 }), error => error.status === 403);
  const deletion = await lifecycle.deleteObservation(committee, lifecycleObservation.observationId, { expectedRevision: incompatibleReassignment.revision });
  assert.notEqual(deletion.replacementObservationId, lifecycleObservation.observationId);
  assert.ok(await prisma.evaluationSignup.findUnique({ where: { signupId: lifecycleSignup.signupId } }));
  const replacement = await prisma.observation.findUniqueOrThrow({ where: { observationId: deletion.replacementObservationId }, include: { timeOptions: true, signedAssessment: true, candidates: true, processFeedback: true } });
  assert.equal(replacement.status, 'PENDING'); assert.equal(replacement.assignedTemplateId, incompatibleTemplate.id);
  assert.equal(replacement.timeOptions.length, 1); assert.equal(replacement.signedAssessment, null);
  assert.equal(replacement.candidates.length, 0); assert.equal(replacement.processFeedback.length, 0);
  for (const [model, where] of [
    ['observation', { observationId: lifecycleObservation.observationId }], ['recommendationList', { listId: lifecycleList.listId }],
    ['observationCandidate', { candidateId: lifecycleCandidate.candidateId }], ['invitationAttempt', { attemptId: lifecycleAttempt.attemptId }],
    ['signedAssessment', { observationId: lifecycleObservation.observationId }], ['processFeedback', { feedbackId: lifecycleFeedback.feedbackId }],
    ['feedbackAttachment', { attachmentId: lifecycleAttachment.attachmentId }],
  ]) assert.equal(await prisma[model].findFirst({ where }), null, model);
  const detachedNotification = await prisma.notification.findUniqueOrThrow({ where: { notificationId: lifecycleNotification.notificationId }, include: { emailDelivery: true } });
  assert.equal(detachedNotification.targetId, null); assert.equal(detachedNotification.inAppEnabled, false); assert.equal(detachedNotification.emailDelivery.status, 'skipped');
  await assert.rejects(lifecycle.deleteObservation(committee, lifecycleObservation.observationId, { expectedRevision: 0 }), error => error.status === 409 && /already deleted/.test(error.message));
  const refreshedSignup = await prisma.evaluationSignup.findUniqueOrThrow({ where: { signupId: lifecycleSignup.signupId } });
  await lifecycle.deleteSignup(committee, lifecycleSignup.signupId, { expectedRevision: refreshedSignup.revision, observations: [{ id: replacement.observationId, expectedRevision: replacement.workflowRevision }] });
  assert.equal(await prisma.evaluationSignup.findUnique({ where: { signupId: lifecycleSignup.signupId } }), null);
  await assert.rejects(lifecycle.deleteSignup(committee, lifecycleSignup.signupId, { expectedRevision: refreshedSignup.revision, observations: [] }), error => error.status === 409 && /already deleted/.test(error.message));

  // Signed observations block both observation and signup deletion.
  const protectedSignup = await prisma.evaluationSignup.create({ data: { cycleId, professorId: lifecycleObserver.professorId, sectionId: sections[5] } });
  const protectedObservation = await prisma.observation.create({ data: { cycleId, signupId: protectedSignup.signupId, assignedTemplateId: template.id } });
  await prisma.signedAssessment.create({ data: { observationId: protectedObservation.observationId, templateId: template.id, responses: { answers: {}, comments: '', promptAnswers: {} }, observerSignedAt: now } });
  await assert.rejects(lifecycle.deleteObservation(committee, protectedObservation.observationId, { expectedRevision: 0 }), /must be retained/);
  await assert.rejects(lifecycle.deleteSignup(committee, protectedSignup.signupId, { expectedRevision: 0, observations: [{ id: protectedObservation.observationId, expectedRevision: 0 }] }), /must be retained/);
  assert.ok(await prisma.observation.findUnique({ where: { observationId: protectedObservation.observationId } }));
  requestUser = faculty[4];
  const observationDeleteRoute = load('src/app/api/observations/[observationId]/route.ts');
  const signupDeleteRoute = load('src/app/api/evaluation-signups/[signupId]/route.ts');
  const deleteRequest = body => new Request('http://localhost/api/delete-test', { method: 'DELETE', headers: { origin: 'http://localhost', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await observationDeleteRoute.DELETE(deleteRequest({ expectedRevision: 0 }), { params: Promise.resolve({ observationId: protectedObservation.observationId }) })).status, 403);
  assert.equal((await signupDeleteRoute.DELETE(deleteRequest({ expectedRevision: 0, observations: [{ id: protectedObservation.observationId, expectedRevision: 0 }] }), { params: Promise.resolve({ signupId: protectedSignup.signupId }) })).status, 403);
  requestUser = null;
  checked('safe observation/signup deletion, clean replacement, dependency cleanup, stale conflicts, permissions and signed-history retention');

  const pairedBeforeReassignment = await prisma.observation.findUniqueOrThrow({ where: { observationId: paired.observationId } });
  const reassigned = await lifecycle.reassignObservationTemplate(committee, paired.observationId, { templateId: template.id, expectedRevision: pairedBeforeReassignment.workflowRevision });
  assert.equal(reassigned.templateId, template.id);
  let form = await forms.getFacultyAssessment(observer), responses = { answers: { [template.criteria[0].id]: 0 }, comments: 'Retained', promptAnswers: { [template.commentPrompts[0].id]: 'Observed evidence' } };
  assert.ok(form);
  assert.ok(new Date(form.scheduledAt) > new Date(), 'A confirmed future appointment can open the form');
  await assert.rejects(assessments.saveFacultyAssessment(faculty[0], { action: 'acknowledge', revision: form.revision, acknowledged: true }));
  await assert.rejects(assessments.saveFacultyAssessment(observer, { action: 'save', revision: form.revision, responses: { ...responses, answers: { [template.criteria[0].id]: 5 } } }));
  const draft = await assessments.saveFacultyAssessment(observer, { action: 'save', revision: form.revision, responses });
  assert.equal((await forms.getFacultyAssessment(observer)).revision, draft.form.revision, 'The save response revision survives the PostgreSQL JSON round trip');
  assert.deepEqual((await forms.getFacultyAssessment(faculty[0])).responses.answers, {}, 'Observees cannot read observer drafts.');
  await assert.rejects(assessments.saveFacultyAssessment(observer, { action: 'save', revision: form.revision, responses }));
  const revised = await configuration.updateTemplate(prisma, committee, template.id, { expectedRevision: 1, title: 'Edited assigned template' });
  await assert.rejects(assessments.saveFacultyAssessment(observer, { action: 'save', revision: draft.form.revision, responses }));
  form = await forms.getFacultyAssessment(observer);
  assert.equal(form.templateId, revised.id);
  await assert.rejects(assessments.saveFacultyAssessment({ ...observer, permissions: ['profile.read.own'] }, { action: 'save', revision: form.revision, responses }));
  const submitted = await assessments.saveFacultyAssessment(observer, { action: 'acknowledge', revision: form.revision, responses, acknowledged: true });
  assert.ok(submitted.form.observerSignedAt); assert.equal(submitted.form.locked, false);
  await assert.rejects(assessments.saveFacultyAssessment(observer, { action: 'save', revision: submitted.form.revision, responses }));
  const review = await forms.getFacultyAssessment(faculty[0]);
  const finalized = await Promise.allSettled([0, 1].map(() => assessments.saveFacultyAssessment(faculty[0], { action: 'acknowledge', revision: review.revision, acknowledged: true })));
  assert.equal(finalized.filter(result => result.status === 'fulfilled').length, 1);
  const assessment = await prisma.signedAssessment.findUnique({ where: { observationId: paired.observationId } });
  assert.ok(assessment.isLocked && assessment.observerSignedAt && assessment.observeeSignedAt);
  assert.equal((await prisma.observation.findUnique({ where: { observationId: paired.observationId } })).status, 'COMPLETED');
  const frozenBeforeLiveEdit = await forms.getFacultyAssessment(observer);
  const editedAfterFinalization = await configuration.updateTemplate(prisma, committee, template.id, { expectedRevision: revised.revision, title: 'Changed live template after finalization', criteria: [{ id: template.criteria[0].id, key: 'rating', prompt: 'A different live question', type: 'rating', required: true, order: 0, options: [{ value: 10, label: 'Different low' }, { value: 20, label: 'Different high' }] }], signatureLabels: { observer: 'Changed observer label', observee: 'Changed observee label' } });
  const archivedAfterFinalization = await configuration.deleteTemplate(prisma, committee, template.id, { expectedRevision: editedAfterFinalization.revision });
  assert.equal(archivedAfterFinalization.archived, true);
  const frozenAfterLiveEdit = await forms.getFacultyAssessment(observer);
  assert.deepEqual({ title: frozenAfterLiveEdit.title, criteria: frozenAfterLiveEdit.criteria, responses: frozenAfterLiveEdit.responses, signatureLabels: frozenAfterLiveEdit.signatureLabels },
    { title: frozenBeforeLiveEdit.title, criteria: frozenBeforeLiveEdit.criteria, responses: frozenBeforeLiveEdit.responses, signatureLabels: frozenBeforeLiveEdit.signatureLabels });
  checked('real draft persistence, assigned template edits, sparse scales, separate acknowledgements and concurrent finalization');
  for (const participant of [observer, faculty[0]]) {
    const finalizedReview = await forms.getFacultyAssessment(participant);
    assert.equal(finalizedReview.locked, true); assert.equal(finalizedReview.canEdit, false); assert.equal(finalizedReview.canAcknowledge, false);
    assert.deepEqual(finalizedReview.responses, responses);
    const html = renderToStaticMarkup(createElement(load('src/components/observations/faculty-assessment-screen.tsx').FacultyAssessmentScreen, { initial: finalizedReview }));
    assert.match(html, /type="submit"[^>]*>Next/); assert.ok(!/type="submit"[^>]*\sdisabled=/.test(html));
  }
  checked('both participants reopen finalized assessments with retained answers and enabled read-only navigation');

  await assert.rejects(participation.submitFacultyFeedback(faculty[0], { observationId: paired.observationId, satisfaction: 4, difficulties: '', suggestions: '' }));
  const deadlineRecord = await freshInvitation(1, 0);
  const deadlinePayload = { candidateId: deadlineRecord.candidate.candidateId, attemptId: deadlineRecord.attempt.attemptId, meetingOptionId: deadlineRecord.record.timeOptions[0].timeOptionId };
  await invitations.acceptFacultyInvitation(faculty[0], deadlinePayload);
  await invitations.selectFacultyObserver(faculty[1], { candidateId: deadlineRecord.candidate.candidateId });
  await prisma.observation.update({ where: { observationId: deadlineRecord.record.observationId }, data: { scheduledAt: new Date(now.getTime() - 3600000), scheduledEndsAt: new Date(now.getTime() - 1800000) } });
  selectedObservation = deadlineRecord.record.observationId;
  const deadlineForm = await forms.getFacultyAssessment(faculty[0]); assert.ok(deadlineForm);
  await prisma.evaluationCycle.update({ where: { cycleId }, data: { observationDeadline: new Date(now.getTime() - 1000) } });
  await assert.rejects(invitations.acceptFacultyInvitation(faculty[0], deadlinePayload));
  await assert.rejects(invitations.selectFacultyObserver(faculty[1], { candidateId: deadlineRecord.candidate.candidateId }));
  assert.equal(await forms.getFacultyAssessment(faculty[0]), null);
  await assert.rejects(assessments.saveFacultyAssessment(faculty[0], { action: 'save', revision: deadlineForm.revision, responses }));
  checked('observation deadline enforced on direct acceptance, final selection and assessment writes');
  const file = { name: 'evidence.pdf', type: 'application/pdf', bytes: Buffer.from('%PDF-1.7\nIsolated evidence fixture') };
  await assert.rejects(attachments.uploadFacultyAttachment(faculty[3], paired.observationId, file));
  await assert.rejects(attachments.uploadFacultyAttachment(faculty[0], paired.observationId, { ...file, name: '../unsafe.pdf' }));
  await assert.rejects(attachments.uploadFacultyAttachment(faculty[0], paired.observationId, { ...file, bytes: Buffer.from('<script>invalid</script>') }));
  const uploaded = await attachments.uploadFacultyAttachment(faculty[0], paired.observationId, file);
  assert.deepEqual((await attachments.readFacultyAttachment(faculty[0], uploaded.attachmentId)).bytes, file.bytes);
  await assert.rejects(attachments.readFacultyAttachment(observer, uploaded.attachmentId));
  await assert.rejects(participation.submitFacultyFeedback(observer, { observationId: paired.observationId, satisfaction: 5, difficulties: '', suggestions: '', attachmentIds: [uploaded.attachmentId] }));
  await participation.submitFacultyFeedback(faculty[0], { observationId: paired.observationId, satisfaction: 4, difficulties: 'None', suggestions: 'Keep it simple', attachmentIds: [uploaded.attachmentId] });
  await participation.submitFacultyFeedback(observer, { observationId: paired.observationId, satisfaction: 5, difficulties: '', suggestions: '' });
  await participation.submitFacultyFeedback(faculty[0], { observationId: paired.observationId, satisfaction: 4, difficulties: 'None', suggestions: 'Keep it simple' });
  assert.equal(await prisma.processFeedback.count({ where: { observationId: paired.observationId } }), 2);
  await assert.rejects(participation.submitFacultyFeedback(faculty[3], { observationId: paired.observationId, satisfaction: 4, difficulties: '', suggestions: '' }));
  checked('feedback participant ownership, window and duplicate protection');
  assert.ok((await prisma.feedbackAttachment.findUnique({ where: { attachmentId: uploaded.attachmentId } })).feedbackId);
  checked('private supporting files: actual bytes, type/path checks, owner-only download and transactional feedback attachment');
  // HTTP boundary executes real services with only session identity substituted.
  const route = load('src/app/api/me/dashboard/requests/accept/route.ts');
  const request = (origin, body = payload1) => new Request('http://localhost/api/me/dashboard/requests/accept', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  requestUser = null; assert.equal((await route.POST(request('http://localhost'))).status, 401);
  requestUser = faculty[1]; assert.equal((await route.POST(request('https://foreign.test'))).status, 403);
  requestUser = { ...faculty[1], permissions: [] }; const denied = await route.POST(request('http://localhost')); assert.equal(denied.status, 403); assert.match(denied.headers.get('cache-control'), /no-store/);
  checked('API authentication, direct permission denial, origin and no-store');

  const semesters = load('src/server/services/semesters.ts');
  const configReads = load('src/server/queries/configuration.ts');
  const existing = await configReads.getCycle(prisma, committee, cycleId);
  const { cycleDeadlines, deadlinePayload: settingsPayload } = load('src/lib/ac-configuration.ts');
  const settings = { ...cycleDeadlines(existing), startsOn: existing.semester.startsOn, endsOn: existing.semester.endsOn };
  for (let i = 0, baseline = existing; i < 2; i++) {
    const saved = await configuration.updateSettings(prisma, committee, cycleId, { expectedCycleRevision: baseline.revision, expectedSemesterRevision: baseline.semester.revision, semester: { startsOn: settings.startsOn, endsOn: settings.endsOn }, deadlines: settingsPayload(settings, baseline.semester.timeZone, baseline) });
    assert.equal(saved.cycle.revision, baseline.revision + 1); assert.equal(saved.semester.revision, baseline.semester.revision + 1);
    baseline = await configReads.getCycle(prisma, committee, cycleId); assert.equal(baseline.signupDeadline, existing.signupDeadline);
  }
  checked('Semester Settings frontend payload saves, reloads and saves again with exact deadlines and revisions');
  await assert.rejects(semesters.createSemester(prisma, faculty[0], { year: 2098, season: 'Spring', startsOn: '2098-01-01', endsOn: '2098-05-01', timeZone: 'America/Chicago' }));
  const newSemester = await semesters.createSemester(prisma, committee, { year: 2098, season: 'Spring', startsOn: '2098-01-01', endsOn: '2098-05-01', timeZone: 'America/Chicago' });
  assert.equal(newSemester.name, 'Spring 2098');
  await assert.rejects(semesters.createSemester(prisma, committee, { year: 2098, season: 'Spring', startsOn: '2098-01-01', endsOn: '2098-05-01', timeZone: 'America/Chicago' }));
  await semesters.deleteSemester(prisma, committee, newSemester.id, { expectedRevision: 0, expectedCycleRevision: null });
  const currentSemester = await prisma.semester.findUnique({ where: { semesterId } });
  const currentCycle = await prisma.evaluationCycle.findUnique({ where: { cycleId } });
  await assert.rejects(semesters.deleteSemester(prisma, faculty[0], semesterId, { expectedRevision: currentSemester.revision, expectedCycleRevision: currentCycle.revision }));
  await assert.rejects(semesters.deleteSemester(prisma, committee, semesterId, { expectedRevision: currentSemester.revision + 1, expectedCycleRevision: currentCycle.revision }));
  assert.ok(await prisma.signedAssessment.findUnique({ where: { observationId: paired.observationId } }));

  // A semester containing acknowledged/completed history is retained in full.
  await assert.rejects(
    semesters.deleteSemester(prisma, committee, semesterId, { expectedRevision: currentSemester.revision, expectedCycleRevision: currentCycle.revision }),
    error => error.code === 'HISTORICAL_RECORDS_RETAINED' && error.status === 409,
  );
  assert.ok(await prisma.semester.findUnique({ where: { semesterId } }));
  assert.ok(await prisma.signedAssessment.findUnique({ where: { observationId: paired.observationId } }));
  assert.deepEqual((await attachments.readFacultyAttachment(faculty[0], uploaded.attachmentId)).bytes, file.bytes);

  // Use a separate unprotected semester to prove rollback and complete cleanup
  // without weakening the historical-record safeguard above.
  const disposableSemester = await semesters.createSemester(prisma, committee, { year: 2097, season: 'Summer', startsOn: '2097-05-20', endsOn: '2097-08-10', timeZone: 'America/Chicago' });
  const disposableCycle = await prisma.evaluationCycle.create({ data: { semesterId: disposableSemester.id, cycleName: 'Disposable cycle', signupDeadline: new Date('2097-06-01T12:00:00Z'), observationDeadline: new Date('2097-07-01T12:00:00Z'), feedbackDeadline: new Date('2097-07-15T12:00:00Z') } });
  const disposableSection = await prisma.courseSection.create({ data: { semesterId: disposableSemester.id, courseId, sectionCode: 'delete-fixture', teaches: { create: { professorId: sourceProfile.professorId } } } });
  const disposableSignup = await prisma.evaluationSignup.create({ data: { cycleId: disposableCycle.cycleId, professorId: sourceProfile.professorId, sectionId: disposableSection.sectionId } });
  const disposableObservation = await prisma.observation.create({ data: { cycleId: disposableCycle.cycleId, signupId: disposableSignup.signupId, assignedTemplateId: template.id } });
  const failedDeleteDb = {};
  failedDeleteDb.$transaction = (run, options) => prisma.$transaction(db => run(new Proxy(db, { get(target, key) { if (key === 'semester') return { ...target.semester, delete: async () => { throw new Error('injected delete failure'); } }; return target[key]; } })), options);
  await assert.rejects(semesters.deleteSemester(failedDeleteDb, committee, disposableSemester.id, { expectedRevision: 0, expectedCycleRevision: 0 }), /injected/);
  assert.ok(await prisma.observation.findUnique({ where: { observationId: disposableObservation.observationId } }));
  await semesters.deleteSemester(prisma, committee, disposableSemester.id, { expectedRevision: 0, expectedCycleRevision: 0 });
  assert.equal(await prisma.semester.findUnique({where:{semesterId:disposableSemester.id}}),null);
  assert.equal(await prisma.evaluationCycle.findUnique({where:{cycleId:disposableCycle.cycleId}}),null);
  for(const model of ['evaluationSignup','observation']) assert.equal(await prisma[model].count({where:{cycleId:disposableCycle.cycleId}}),0,model);
  assert.equal(await prisma.courseSection.count({where:{semesterId:disposableSemester.id}}),0);
  assert.ok(await prisma.semester.findUnique({where:{semesterId}}));
  assert.ok(await prisma.signedAssessment.findUnique({where:{observationId:paired.observationId}}));
  assert.ok(await prisma.feedbackAttachment.findUnique({where:{attachmentId:uploaded.attachmentId}}));
  assert.ok(await prisma.observationTemplate.count()); assert.ok(await prisma.professor.count() >= faculty.length);
  checked('semester creation, authorization, stale-delete rejection, historical retention, rollback and unprotected dependency deletion');
  console.log(`Completed ${checks} populated PostgreSQL check groups in disposable database ${databaseName}. Application records unchanged.`);
} finally {
  await prisma.$disconnect(); await pool.end();
  if (created) {
    assert.match(databaseName, /^faculty_test_[a-f0-9]{32}$/); assert.notEqual(databaseName, decodeURIComponent(appUrl.pathname.slice(1)));
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  }
  await admin.end();
  assert.equal(dirname(resolve(privateDirectory)), resolve(tmpdir())); assert.ok(basename(privateDirectory).startsWith('faculty_files_test_'));
  await rm(privateDirectory, { recursive: true });
}
