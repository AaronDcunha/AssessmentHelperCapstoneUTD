import '../../scripts/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { pendingActionOverdue, pendingStage, unmatchedStage } = await import('../../src/server/queries/ac-metrics.ts');
const { feedbackWindowOpen } = await import('../../src/server/services/feedback-window.ts');

const now = new Date('2026-10-30T12:00:00Z');
const past = new Date('2026-10-29T12:00:00Z');
const future = new Date('2026-10-31T12:00:00Z');
const observation = { status: 'CONFIRMED', observerId: 'observer', scheduledAt: past, signedAssessment: null, facultyIssues: [] };

test('unfinished actions become overdue at the observation deadline, independently of evaluation eligibility', () => {
  assert.equal(pendingActionOverdue(observation, now, future), false);
  assert.equal(pendingActionOverdue(observation, now, now), true);
  assert.equal(pendingActionOverdue(observation, now, past), true);
  assert.equal(pendingActionOverdue({ ...observation, observerId: null }, now, past), true);
  assert.equal(pendingActionOverdue({ ...observation, signedAssessment: { observerSignedAt: past } }, now, past), true);
});

test('upcoming, cancelled, reported missing and finalized work are not overdue pending actions', () => {
  for (const record of [
    { ...observation, scheduledAt: future },
    { ...observation, status: 'CANCELLED' },
    { ...observation, status: 'CANCELED' },
    { ...observation, status: 'NOT_OCCURRED' },
    { ...observation, facultyIssues: [{}] },
    { ...observation, signedAssessment: { isLocked: true, observerSignedAt: past, observeeSignedAt: past } },
  ]) assert.equal(pendingActionOverdue(record, now, past), false);
});

test('cancelled generations and releases cannot advance an unmatched signup stage', () => {
  const retained = [
    { status: 'CANCELLED', recommendationsReleasedAt: past, recommendationGenerationId: 'old' },
    { status: 'CANCELED', recommendationGenerationId: 'old-2' },
  ];
  assert.equal(unmatchedStage(retained), 'awaiting-generation');
  assert.equal(unmatchedStage([...retained, { status: 'PENDING' }]), 'awaiting-generation');
  assert.equal(unmatchedStage([...retained, { status: 'PENDING', currentDraftListId: 'new' }]), 'awaiting-release');
  assert.equal(unmatchedStage([...retained, { status: 'PENDING', currentReleasedList: {publishedAt:now} }]), 'awaiting-selection');
  assert.equal(unmatchedStage([{status:'PENDING',recommendationGenerationId:'unclassified',recommendationsReleasedAt:now}]), 'awaiting-generation');
});

test('required surveys open at assessment lock and use the inclusive feedback deadline', () => {
  const record = { ...observation, status: 'SURVEY_PENDING', cycle: { observationDeadline: past, feedbackDeadline: now },
    signedAssessment: { isLocked: true, observerSignedAt: past, observeeSignedAt: past } };
  assert.equal(pendingStage(record, now), 'survey-pending');
  assert.equal(feedbackWindowOpen(record, now), true);
  assert.equal(feedbackWindowOpen(record, future), false);
  assert.equal(feedbackWindowOpen({ ...record, signedAssessment: null }, now), false);
  assert.equal(feedbackWindowOpen({ ...record, status: 'CANCELLED' }, now), false);
  assert.equal(pendingActionOverdue(record, now, past, now), false);
  assert.equal(pendingActionOverdue(record, future, past, now), true);
});
