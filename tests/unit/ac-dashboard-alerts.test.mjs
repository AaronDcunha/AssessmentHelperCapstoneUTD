import '../configuration-loader.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeAttention, attentionReviewHref } from '../../src/lib/ac-attention.ts';
import { acApi } from '../../src/lib/ac-api.ts';

const attention = ['overdue', 'unmatched', 'incomplete'].map(issue => ({ id: 'same-id', faculty: { id: 'faculty', name: 'Faculty One' }, issue, observationId: 'observation', observationStatus: 'PENDING' }));
const alert = id => ({ id, observationId: 'observation', cycleId: 'cycle', createdBy: { id: 'faculty', name: 'Faculty One' }, context: { observee: { name: 'Faculty One' }, observationStatus: 'SCHEDULED' } });

test('joins alerts by stable message identity, preserving distinct messages and all non-alert issues', () => {
  const duplicated = { id: 'attention-row', alertId: 'alert-a', faculty: { id: 'faculty', name: 'Old display' }, issue: 'alert', observationId: 'observation', observationStatus: 'PENDING' };
  const rows = mergeAttention([...attention, duplicated], [alert('alert-a'), alert('alert-b'), alert('alert-a')]);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows.slice(0, 3), attention.map(item => ({ ...item, alertId: undefined, rowKey: `${item.issue}:${item.id}` })));
  assert.equal(new Set(rows.map(row => row.rowKey)).size, 5);
  assert.deepEqual(rows.filter(row => row.issue === 'alert').map(row => [row.alertId, row.observationStatus]), [['alert-a', 'SCHEDULED'], ['alert-b', 'SCHEDULED']]);
  assert.equal(rows[3].faculty.name, 'Faculty One');
  assert.deepEqual(mergeAttention([duplicated], []), [{ ...duplicated, rowKey: 'alert:alert-a' }], 'Attention alert survives alert-list failure');
  assert.equal(mergeAttention([], [alert('alert-a')]).length, 1, 'Alert list survives attention failure');
});

test('review destinations retain each exact alert and encode IDs without substituting an observation message', () => {
  assert.equal(attentionReviewHref({ issue: 'alert', id: 'row', alertId: 'alert & a', observationId: 'observation / a' }), '/ac/observations/observation%20%2F%20a?alertId=alert%20%26%20a');
  assert.equal(attentionReviewHref({ issue: 'alert', id: 'alert-id', observationId: 'observation' }), '/ac/observations/observation?alertId=alert-id');
  assert.equal(attentionReviewHref(attention[0]), '/ac/observations/observation');
  assert.equal(attentionReviewHref({ ...attention[0], observationId: null }), null);
});

test('cycle alert helper follows pagination and saved-detail helper uses only GET', async () => {
  const originalFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (path, init) => {
    calls.push({ path, method: init?.method ?? 'GET', cache: init?.cache });
    if (path.startsWith('/api/alerts/')) return Response.json(alert('alert-b'));
    const more = !path.includes('cursor=');
    return Response.json({ items: [alert(more ? 'alert-a' : 'alert-b')], pageInfo: { hasMore: more, nextCursor: more ? 'alert-a' : null } });
  };
  try {
    assert.deepEqual((await acApi.getCycleAlerts('cycle a')).map(row => row.id), ['alert-a', 'alert-b']);
    assert.equal((await acApi.getAlert('alert-b')).id, 'alert-b');
    assert.deepEqual(calls.map(c => c.path), ['/api/evaluation-cycles/cycle%20a/alerts', '/api/evaluation-cycles/cycle%20a/alerts?cursor=alert-a', '/api/alerts/alert-b']);
    assert(calls.every(c => c.method === 'GET' && c.cache === 'no-store'));
    globalThis.fetch = async () => Response.json({ error: { message: 'Private exception' } }, { status: 500 });
    await assert.rejects(acApi.getCycleAlerts('cycle'), error => !error.message.includes('Private exception'));
  } finally { globalThis.fetch = originalFetch; }
});
