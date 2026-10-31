import '../../scripts/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const { getObservationCandidates } = await import('../../src/server/queries/observation-candidates.ts');
const { ConfigurationError } = await import('../../src/server/configuration-validation.ts');
const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const actor = { id: id(1), permissions: ['observations.read'] };
const now = new Date('2026-10-28T12:00:00Z');
const url = query => new URL('http://localhost/api/observations/' + id(2) + '/candidates' + (query ? '?' + query : ''));
const forbidden = () => assert.fail('Unexpected database access');
const readOnly = value => new Proxy(value, { get(target, key) {
  if (typeof key === 'string' && /^(create|update|delete|upsert|execute)/i.test(key)) return forbidden;
  return Reflect.get(target, key);
} });

function fixture() {
  const semester = { semesterId: id(3), termCode: '26f', termName: 'Fall 2026', startsOn: new Date('2026-08-31'), endsOn: new Date('2026-12-16'), timeZone: 'America/Chicago' };
  const course = { courseId: id(4), courseCode: 'CS 4348', courseTitle: 'Operating Systems', departmentId: id(5), courseLevel: 4000 };
  const meetings = ['Monday', 'Wednesday'].map((dayOfWeek, i) => ({ meetingId: id(6 + i), dayOfWeek, startTime: '10:00', endTime: '11:15', location: 'Current room' }));
  const record = { observationId: id(2), cycleId: id(8), workflowRevision: 5, recommendationGenerationId: id(9), recommendationsReleasedAt: null,
    currentDraftListId: id(14), currentReleasedListId: null,
    cycle: { semesterId: semester.semesterId, observationDeadline: new Date('2026-11-30T23:00:00Z') },
    signup: { professorId: id(10), professor: { departmentId: course.departmentId }, section: { sectionId: id(11), semesterId: semester.semesterId, semester, course, classMeetings: meetings } },
    timeOptions: [
      { timeOptionId: id(12), preferredDate: new Date('2026-11-09'), startsAt: new Date('2026-11-09T16:00:00Z'), endsAt: new Date('2026-11-09T17:15:00Z'), timeZone: 'America/Chicago', location: 'Snapshot room' },
      { timeOptionId: id(13), preferredDate: new Date('2026-11-11'), startsAt: null, endsAt: null, timeZone: null, location: null },
    ] };
  const assignment = { section: { semesterId: semester.semesterId, semester, course, classMeetings: [] } };
  const candidates = [20, 21].map((n, i) => ({ candidateId: id(n), observationId: record.observationId, recommendationListId: id(14), professorId: id(30 + i), status: 'ELIGIBLE',
    invitedAt: null, expiresAt: null, respondedAt: null, acceptedOptionId: null, attempts: [],
    professor: { user: { userId: id(40 + i), fullName: `Candidate ${i}`, email: 'SECRET' }, teaches: [assignment, assignment] } }));
  const lists = [{ listId: id(14), observationId: record.observationId, generationId: id(9), generatedAt: now, publishedAt: null, origin: 'GENERATED' }];
  const f = { record, course, semester, candidates, lists, appointments: [], active: true, signedUp: true, calls: [] };
  f.db = readOnly({
    recommendationList: readOnly({ findFirst: async ({ where }) => lists.find(list => list.listId === where.listId && list.observationId === where.observationId) ?? null }),
    observation: readOnly({ findUnique: async () => record, findMany: async () => f.appointments }),
    observationCandidate: readOnly({ findMany: async args => {
      f.calls.push(args);
      const rows = candidates.filter(candidate => candidate.observationId === args.where.observationId
        && candidate.recommendationListId === args.where.recommendationListId
        && (!args.where.candidateId || args.where.candidateId.in.includes(candidate.candidateId)));
      return rows.map(candidate => {
        const attempts = candidate.attempts.slice().sort((a, b) => b.number - a.number).slice(0, 1);
        return args.select.professor ? { ...candidate, attempts } : { candidateId: candidate.candidateId, attempts };
      });
    } }),
    professor: readOnly({ findUnique: async ({ where }) => ({ user: { isActive: f.active }, departmentId: course.departmentId,
      teaches: candidates.find(candidate => candidate.professorId === where.professorId).professor.teaches }) }),
    evaluationSignup: readOnly({ findUnique: async () => f.signedUp ? {} : null }),
  });
  f.read = (query = '', user = actor) => getObservationCandidates(f.db, user, record.observationId, url(query), now);
  return f;
}
function attempt(candidate, number, status) {
  return { attemptId: id(50 + number), candidateId: candidate.candidateId, number, status,
    invitedAt: new Date('2026-10-20T10:00:00Z'), expiresAt: new Date('2026-10-22T10:00:00Z'), respondedAt: null };
}

test('AC broad grant is required before any read; own observees, observers, candidates and role labels gain no new access', async () => {
  for (const permissions of [[], ['observations.read.own'], ['recommendations.read.released.own'], ['signups.read', 'recommendations.generate'], ['test:admin']]) {
    await assert.rejects(getObservationCandidates(readOnly({ observation: { findUnique: forbidden } }),
      { ...actor, roles: ['Admin'], permissions }, id(2), url(), now), error => error.status === 403);
  }
  const f = fixture();
  assert.equal((await f.read()).items.length, 2); // Unreleased records are authorized only via the broad grant.
  f.record.recommendationsReleasedAt = now;
  await assert.rejects(f.read('', { id: id(10), permissions: ['observations.read.own', 'recommendations.read.released.own'] }), error => error.status === 403);
});

test('read maps recorded identity/state, course evidence and stored proposal metadata without writes', async () => {
  const f = fixture(), result = await f.read(), item = result.items[0];
  assert.deepEqual(item.professor, { id: id(40), name: 'Candidate 0' });
  assert.equal(item.status, 'ELIGIBLE'); assert.equal(item.responseStatus, null); assert.equal(item.activeAttempt, null); assert.equal(item.outcome, null);
  assert.equal(item.courseHistory.length, 1); assert.equal(item.courseHistory[0].semester.id, f.semester.semesterId);
  assert.equal(result.generationId, id(9)); assert.equal(result.releasedAt, null); assert.equal(result.observationRevision, 5);
  assert.deepEqual(item.availableMeetingOptionIds, [id(12), id(13)]);
  assert.deepEqual(result.proposedMeetings[1], { id: id(13), sectionId: id(11), date: '2026-11-11', startsAt: null, endsAt: null, timeZone: null, location: null });
  assert.equal(result.proposedMeetings[0].location, 'Snapshot room');
  assert.doesNotMatch(JSON.stringify(result), /SECRET|password|notification/);
});

test('history includes older semesters, deduplicates course/semester pairs before limiting to five and uses academic chronology', async () => {
  const f = fixture(), candidate = f.candidates[0], current = candidate.professor.teaches[0];
  const terms = ['24f', '25u', '26s', '25f', '26u']; // Deliberately not chronological or lexical.
  const older = terms.map((termCode, i) => ({ section: { ...current.section, semesterId: id(90 - i),
    semester: { semesterId: id(90 - i), termCode, termName: `Display label ${i}`, startsOn: null, endsOn: null } } }));
  candidate.professor.teaches = [older[0], current, older[4], older[1], current, older[3], older[2], older[4]];
  const before = JSON.stringify(candidate);
  const item = (await f.read()).items[0];
  assert.deepEqual(item.courseHistory.map(entry => entry.semester.id), [id(3), id(86), id(88), id(87), id(89)]);
  assert.ok(item.courseHistory.every(entry => entry.course.id === f.course.courseId));
  assert.equal(item.courseHistory.length, 5);
  assert.deepEqual(item.availableMeetingOptionIds, [id(12), id(13)]);
  assert.equal(JSON.stringify(candidate), before);
  assert.ok(item.courseHistory.every(entry => !('termOrder' in entry)));
});

test('history ties use course code, course UUID and semester UUID deterministically; unknown terms sort last', async () => {
  const f = fixture(), candidate = f.candidates[0], current = candidate.professor.teaches[0];
  const a = { section: { ...current.section, course: { ...f.course, courseId: id(61), courseCode: 'CS 4337' } } };
  const b = { section: { ...a.section, course: { ...a.section.course, courseId: id(60) } } };
  const legacy = { section: { ...b.section, semesterId: id(81), semester: { semesterId: id(81), termCode: 'legacy', termName: 'Unknown semester' } } };
  const otherLegacy = { section: { ...legacy.section, semesterId: id(80), semester: { ...legacy.section.semester, semesterId: id(80) } } };
  candidate.professor.teaches = [legacy, a, current, otherLegacy, b, a];
  const first = (await f.read()).items[0].courseHistory;
  assert.deepEqual(first.map(entry => [entry.course.id, entry.semester.id]), [
    [id(60), id(3)], [id(61), id(3)], [id(4), id(3)], [id(60), id(80)], [id(60), id(81)],
  ]);
  candidate.professor.teaches.reverse();
  assert.deepEqual((await f.read()).items[0].courseHistory, first);
});

test('older teaching remains visible but cannot establish current-semester meeting eligibility', async () => {
  const f = fixture(), candidate = f.candidates[0], current = candidate.professor.teaches[0];
  candidate.professor.teaches = [{ section: { ...current.section, semesterId: id(80),
    semester: { semesterId: id(80), termCode: '25f', termName: 'Fall 2025' } } }];
  const item = (await f.read()).items[0];
  assert.equal(item.courseHistory[0].semester.id, id(80));
  assert.deepEqual(item.availableMeetingOptionIds, []);
  candidate.professor.teaches = [];
  assert.deepEqual((await f.read()).items[0].courseHistory, []);
});

test('latest attempt is selected before response filtering; selected/cancelled outcomes never invent earlier responses', async () => {
  const f = fixture(), first = f.candidates[0], second = f.candidates[1];
  first.status = 'SELECTED'; first.acceptedOptionId = id(12);
  first.attempts = [attempt(first, 1, 'DECLINED'), attempt(first, 2, 'ACCEPTED')];
  second.status = 'CANCELLED'; second.attempts = [attempt(second, 3, 'CANCELLED')];
  const result = await f.read();
  assert.equal(result.items[0].outcome, 'SELECTED'); assert.equal(result.items[0].responseStatus, 'ACCEPTED');
  assert.equal(result.items[0].activeAttempt.sequence, 2); assert.equal(result.items[0].acceptedMeetingOptionId, id(12));
  assert.equal(result.items[0].activeAttempt.acceptedMeetingOptionId, null); // Legacy attempt has no recorded option; do not infer from candidate.
  assert.equal(result.items[1].responseStatus, 'CANCELLED'); assert.equal(result.items[1].outcome, 'CANCELLED');
  assert.deepEqual((await f.read('responseStatus=DECLINED')).items, []);
  assert.deepEqual((await f.read('responseStatus=ACCEPTED')).items.map(item => item.id), [first.candidateId]);
  for (const status of ['PENDING', 'DECLINED', 'EXPIRED']) {
    first.status = status; first.attempts = [attempt(first, 4, status)];
    const item = (await f.read('responseStatus=' + status)).items[0];
    assert.equal(item.status, status); assert.equal(item.responseStatus, status); assert.equal(item.outcome, null);
  }
});

test('expired-but-recorded pending windows stay pending in this read and are never updated', async () => {
  const f = fixture(), candidate = f.candidates[0];
  candidate.status = 'PENDING'; candidate.attempts = [attempt(candidate, 1, 'PENDING')];
  assert.equal((await f.read('responseStatus=PENDING')).items[0].activeAttempt.responseStatus, 'PENDING');
  assert.deepEqual((await f.read('responseStatus=EXPIRED')).items, []);
  assert.equal(candidate.attempts[0].status, 'PENDING');
});

test('compatibility checks conflicts and activity while allowing professors without signup', async () => {
  const f = fixture();
  f.candidates[0].professor.teaches[0].section.classMeetings = [{ dayOfWeek: 'Monday', startTime: '10:30', endTime: '12:00', location: null }];
  assert.deepEqual((await f.read()).items[0].availableMeetingOptionIds, [id(13)]);
  f.candidates[0].professor.teaches[0].section.classMeetings = [];
  f.appointments = [{ scheduledAt: new Date('2026-11-09T16:30:00Z'), scheduledEndsAt: new Date('2026-11-09T17:30:00Z'), signup: { section: f.record.signup.section } }];
  assert.deepEqual((await f.read()).items[0].availableMeetingOptionIds, [id(13)]);
  f.active = false; assert.deepEqual((await f.read()).items[0].availableMeetingOptionIds, []);
  f.active = true; f.signedUp = false; assert.deepEqual((await f.read()).items[0].availableMeetingOptionIds, [id(13)]);
  f.signedUp = true; f.appointments = []; f.record.timeOptions[0].startsAt = new Date('2026-11-09T18:00:00Z');
  assert.deepEqual((await f.read()).items[0].availableMeetingOptionIds, [id(13)]);
});

test('no-signup observers still require the same department, semester and course level and cannot observe themselves', async () => {
  const f = fixture();
  f.signedUp = false;
  const candidate = f.candidates[0], section = candidate.professor.teaches[0].section;
  const originalCourse = section.course;
  section.course = { ...originalCourse, courseLevel: originalCourse.courseLevel + 1000 };
  assert.deepEqual((await f.read()).items[0].availableMeetingOptionIds, []);
  section.course = originalCourse;
  const originalSemester = section.semesterId;
  section.semesterId = id(99);
  assert.deepEqual((await f.read()).items[0].availableMeetingOptionIds, []);
  section.semesterId = originalSemester;
  const find = f.db.professor.findUnique;
  f.db.professor.findUnique = async args => ({ ...await find(args), departmentId: id(99) });
  assert.deepEqual((await f.read()).items[0].availableMeetingOptionIds, []);
  f.db.professor.findUnique = find;
  f.record.signup.professorId = candidate.professorId;
  assert.deepEqual((await f.read()).items[0].availableMeetingOptionIds, []);
});

test('invalid query/path values fail before reads; missing observations and invalid accepted-option ownership are explicit', async () => {
  const db = readOnly({ observation: { findUnique: forbidden } });
  await assert.rejects(getObservationCandidates(db, actor, 'bad', url(), now), error => error.status === 422);
  for (const query of ['view=draft', 'generationId=' + id(9), 'professorId=' + id(30), 'responseStatus=', 'responseStatus=accepted', 'limit=1&limit=2']) {
    await assert.rejects(getObservationCandidates(db, actor, id(2), url(query), now), error => error.status === 400);
  }
  for (const query of ['cursor=bad', 'limit=0', 'limit=101']) {
    await assert.rejects(getObservationCandidates(db, actor, id(2), url(query), now), error => error.status === 422);
  }
  await assert.rejects(getObservationCandidates({ observation: { findUnique: async () => null } }, actor, id(2), url(), now), error => error.status === 404);
  const f = fixture(); f.candidates[0].acceptedOptionId = id(99);
  await assert.rejects(f.read(), error => error.code === 'INCONSISTENT_CANDIDATE');
});

test('pagination applies latest response filtering before the limit and isolates cursor membership', async () => {
  const f = fixture();
  assert.deepEqual((await f.read('limit=1')).pageInfo, { nextCursor: id(20), hasMore: true });
  assert.deepEqual((await f.read('cursor=' + id(20))).items.map(item => item.id), [id(21)]);
  await assert.rejects(f.read('cursor=' + id(99)), error => error.status === 400);
  const candidate = f.candidates[1]; candidate.attempts = [attempt(candidate, 1, 'DECLINED')];
  assert.deepEqual((await f.read('limit=1&responseStatus=DECLINED')).items.map(item => item.id), [id(21)]);
  await assert.rejects(f.read('cursor=' + id(20) + '&responseStatus=DECLINED'), error => error.status === 400);
  f.candidates.length = 0;
  assert.deepEqual((await f.read()).items, []);
});

test('AC reads resolve one list, isolate its cursor and can explicitly inspect preserved history without writes', async () => {
  const f = fixture();
  f.lists.push({ ...f.lists[0], listId: id(15), publishedAt: now });
  f.candidates.push({ ...f.candidates[0], candidateId: id(22), recommendationListId: id(15) });
  f.record.currentReleasedListId = id(15);
  assert.deepEqual((await f.read()).items.map(item => item.id), [id(20), id(21)]);
  const released = await f.read('listId=' + id(15));
  assert.equal(released.list.id, id(15)); assert.equal(released.currentDraftListId, id(14));
  assert.deepEqual(released.items.map(item => item.id), [id(22)]);
  await assert.rejects(f.read('listId=' + id(15) + '&cursor=' + id(20)), error => error.status === 400);
  f.record.currentDraftListId = null;
  assert.deepEqual((await f.read()).items.map(item => item.id), [id(22)]);
  f.record.currentReleasedListId = null;
  assert.equal((await f.read()).list, null); assert.deepEqual((await f.read()).items, []);
  assert.equal((await f.read('listId=' + id(14))).items.length, 2);
  f.lists.push({ ...f.lists[0], listId: id(16), observationId: id(99) });
  await assert.rejects(f.read('listId=' + id(16)), error => error.status === 404);
});

function route(db, authResult = actor) {
  const source = readFileSync(new URL('../../src/app/api/observations/[observationId]/candidates/route.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const loaded = { exports: {} };
  const require = name => {
    if (name.endsWith('/permissions')) return { checkApiPermission: async permission => { assert.equal(permission, 'observations.read'); return authResult; } };
    if (name.endsWith('/prisma')) return { getPrisma: () => {
      if (!db) forbidden();
      return { $transaction: async (read, options) => { assert.equal(options.isolationLevel, 'RepeatableRead'); return read(db); } };
    } };
    if (name.endsWith('/configuration-validation')) return { ConfigurationError };
    if (name.endsWith('/observation-candidates')) return { getObservationCandidates };
    throw new Error(name);
  };
  new Function('require', 'module', 'exports', outputText)(require, loaded, loaded.exports);
  return () => loaded.exports.GET(new Request(url()), { params: Promise.resolve({ observationId: id(2) }) });
}

test('HTTP adapter is private on success, unauthenticated/forbidden, missing observation and dependency failure', async () => {
  for (const status of [401, 403]) {
    const response = await route(null, new Response(null, { status }))();
    assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await response.json()).error.code, status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN');
  }
  const f = fixture(), success = await route(f.db)();
  assert.equal(success.status, 200); assert.equal(success.headers.get('cache-control'), 'private, no-store');
  assert.equal((await success.json()).items[0].id, id(20));
  const missing = await route({ observation: { findUnique: async () => null } })(); assert.equal(missing.status, 404);
  const failed = await route({ observation: { findUnique: async () => { throw new Error('SECRET database failure'); } } })();
  assert.equal(failed.status, 503); assert.equal(failed.headers.get('cache-control'), 'private, no-store');
  assert.doesNotMatch(await failed.text(), /SECRET/);
});
