import '../configuration-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { acApi, ApiRequestError } from '../../src/lib/ac-api.ts';
const { configurationError, cycleDeadlines, deadlineInput, deadlineUtc, deadlinePayload, newTemplate, templateDraft, templatePayload, moveQuestion, moveItem, validDateOnly } = await import('../../src/lib/ac-configuration.ts');

test('semester-zone deadlines round trip exact instants, including seconds and milliseconds', () => {
  const zone = 'America/Chicago';
  assert.equal(deadlineInput('2026-07-01T04:59:22.123Z', zone), '2026-06-30T23:59:22');
  assert.equal(deadlineUtc('2026-06-30T23:59:22', zone, '2026-07-01T04:59:22.123Z'), '2026-07-01T04:59:22.123Z');
  assert.equal(deadlineUtc('2026-12-01T23:59', zone), '2026-12-02T05:59:00.000Z');
  assert.equal(deadlineUtc('2026-07-01T23:59', zone), '2026-07-02T04:59:00.000Z');
  assert.equal(deadlineUtc('2026-07-01T10:30', 'Asia/Kolkata'), '2026-07-01T05:00:00.000Z');
});

test('edited deadlines reject daylight-saving gaps/folds and invalid dates; unchanged folds remain intact', () => {
  for (const input of ['2026-03-08T02:30', '2026-11-01T01:30']) assert.throws(() => deadlineUtc(input, 'America/Chicago'), /daylight-saving/);
  assert.equal(deadlineUtc('2026-11-01T01:30:00', 'America/Chicago', '2026-11-01T07:30:00Z'), '2026-11-01T07:30:00Z');
  for (const input of ['2026-02-30T10:00', '2026-10-01T24:00', '', '2026-10-01']) assert.throws(() => deadlineUtc(input, 'UTC'), /valid deadline/);
  assert.equal(validDateOnly('2026-02-30'), false);
  assert.equal(validDateOnly('2028-02-29'), true);
});

const cycle = { id: 'cycle', revision: 3, semester: { id: 'semester', name: 'Fall 2026', timeZone: 'America/Chicago', revision: 4 }, signupDeadline: '2026-10-31T23:59:59.120Z', observationDeadline: '2026-11-30T23:59:59Z', feedbackDeadline: '2027-01-10T23:59:59Z' };
test('deadline payload enforces chronological instants without truncation or semester-end restrictions', () => {
  assert.deepEqual(deadlinePayload(cycleDeadlines(cycle), cycle.semester.timeZone, cycle), { signupDeadline: cycle.signupDeadline, observationDeadline: cycle.observationDeadline, feedbackDeadline: cycle.feedbackDeadline });
  assert.throws(() => deadlinePayload({ ...cycleDeadlines(cycle), signupDeadline: '2027-02-01T12:00' }, cycle.semester.timeZone, cycle), /ordered/);
  assert.throws(() => cycleDeadlines({ ...cycle, semester: {} }), /time zone is missing/);
});

const template = { id: 'template', title: 'Custom assessment', revision: 7, status: 'draft', publishedAt: null, criteria: [
  { id: 'rating-a', key: 'a', prompt: 'First rating', type: 'rating', required: true, order: 0, weight: 2.5, options: [{ value: 0, label: 'Not demonstrated' }, { value: 10, label: 'Demonstrated' }] },
  { id: 'text-b', key: 'b', prompt: 'Long response', type: 'text', required: false, order: 1, weight: 0 },
  { id: 'rating-c', key: 'c', prompt: 'Second rating', type: 'rating', required: false, order: 2, weight: 1, options: [{ value: -1, label: 'Below' }, { value: 1, label: 'Above' }] },
], commentPrompts: [{ id: 'comment', prompt: 'Additional comments', required: false, order: 0 }], signatureLabels: { observer: 'Observer acknowledgement', observee: 'Faculty acknowledgement' } };
test('template round trip preserves IDs, keys, custom options, weights, comments and labels', () => {
  const draft = templateDraft(template);
  const payload = templatePayload(draft);
  assert.deepEqual(payload, { title: template.title, criteria: template.criteria, commentPrompts: template.commentPrompts, signatureLabels: template.signatureLabels });
  assert.equal('options' in payload.criteria[1], false);
  draft.criteria[0].options[0].label = 'Edited';
  assert.equal(template.criteria[0].options[0].label, 'Not demonstrated', 'Editor must not mutate the loaded record');
});
test('question reordering retains server identity across interleaved types; new UI IDs are omitted', () => {
  const draft = templateDraft(template);
  draft.criteria = moveQuestion(draft.criteria, 'rating-c', -1);
  assert.deepEqual(templatePayload(draft).criteria.map(item => [item.id, item.order]), [['rating-c', 0], ['text-b', 1], ['rating-a', 2]]);
  draft.criteria.push({ uiId: 'temporary-only', key: 'new-key', prompt: 'New prompt', type: 'text', required: false, order: 100, weight: 1 });
  const added = templatePayload(draft).criteria.at(-1);
  assert.equal('id' in added, false); assert.equal('uiId' in added, false); assert.equal(added.order, 3);
  assert.deepEqual(moveItem(['a', 'b'], 1, -1), ['b', 'a']);
});
test('invalid templates do not generate save payloads', () => {
  assert.throws(() => templatePayload(newTemplate()), /between 1 and 100/);
  const draft = templateDraft(template);
  draft.criteria[0].options[1].value = 0;
  assert.throws(() => templatePayload(draft), /distinct integer ratings/);
  draft.criteria[0].options[1].value = 10;
  draft.signatureLabels.observee = ' ';
  assert.throws(() => templatePayload(draft), /signature label/);
});

test('configuration helpers send documented paths, revisions and supported payload shapes', async () => {
  const originalFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (path, init) => {
    calls.push({ path, ...init, body: init?.body ? JSON.parse(init.body) : undefined });
    return Response.json(path === '/api/semesters' || path === '/api/observation-templates' && !init?.method ? { items: [], pageInfo: { nextCursor: null, hasMore: false } } : {});
  };
  try {
    await acApi.getSemesters(); await acApi.getTemplates(); await acApi.getTemplate('draft id');
    await acApi.updateCycle('cycle', { expectedRevision: 3, signupDeadline: cycle.signupDeadline });
    await acApi.updateCycleSettings('cycle', { expectedCycleRevision: 3, expectedSemesterRevision: 4, semester: { startsOn: '2026-08-20', endsOn: '2026-12-20' }, deadlines: deadlinePayload(cycleDeadlines(cycle), cycle.semester.timeZone, cycle) });
    await acApi.createTemplate(templatePayload(templateDraft(template)));
    await acApi.updateTemplate('template', { ...templatePayload(templateDraft(template)), expectedRevision: 7 });
    await acApi.publishTemplate('template', 8);
    assert.deepEqual(calls.map(item => [item.path, item.method ?? 'GET']), [['/api/semesters', 'GET'], ['/api/observation-templates', 'GET'], ['/api/observation-templates/draft%20id', 'GET'], ['/api/evaluation-cycles/cycle', 'PATCH'], ['/api/evaluation-cycles/cycle/settings', 'PUT'], ['/api/observation-templates', 'POST'], ['/api/observation-templates/template', 'PATCH'], ['/api/observation-templates/template/publish', 'POST']]);
    assert.equal('semesterId' in calls[3].body, false);
    assert.equal(calls[4].body.expectedSemesterRevision, 4);
    assert.deepEqual(calls.at(-1).body, { expectedRevision: 8 });
    assert(calls.every(item => item.cache === 'no-store'));
  } finally { globalThis.fetch = originalFetch; }
});
test('errors distinguish authentication, permission, missing, conflicts, validation, network and server failures', async () => {
  for (const [status, pattern] of [[401, /Sign in/], [403, /permission/], [404, /no longer available/], [409, /preserved/], [422, /entered fields/], [500, /server could not/]]) assert.match(configurationError(new ApiRequestError('Request failed with status ' + status, status)), pattern);
  assert.match(configurationError(new TypeError('fetch failed')), /connection/);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ error: { code: 'STALE_REVISION', message: 'Reload before saving.' } }, { status: 409 });
    await assert.rejects(acApi.publishTemplate('template', 7), error => error.code === 'STALE_REVISION' && error.status === 409 && configurationError(error).includes('Reload before saving.'));
    globalThis.fetch = async () => Response.json({ error: { message: 'Private server exception' } }, { status: 500 });
    await assert.rejects(acApi.getTemplates(), error => !error.message.includes('Private server exception'));
  } finally { globalThis.fetch = originalFetch; }
});
