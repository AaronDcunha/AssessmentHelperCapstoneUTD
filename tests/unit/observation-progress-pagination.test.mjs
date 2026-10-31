import test from 'node:test';
import assert from 'node:assert/strict';
import { loadObservationProgressPage } from '../../src/lib/observation-progress-pagination.ts';

test('progress pages cross empty cycles without skipping or duplicating lookahead rows', async () => {
  const records = { a: ['1', '2'], empty: [], b: ['3', '4', '5'] };
  const calls = [];
  const fetch = async (cycle, cursor, limit) => {
    calls.push({ cycle, cursor, limit });
    const rows = records[cycle].filter(id => !cursor || id > cursor);
    const items = rows.slice(0, limit).map(id => ({ id }));
    const hasMore = rows.length > limit;
    return { items, pageInfo: { hasMore, nextCursor: hasMore ? items.at(-1).id : null } };
  };
  const first = await loadObservationProgressPage(['a', 'empty', 'b'], { cycleIndex: 0 }, 2, fetch);
  assert.deepEqual(first.items.map(row => row.id), ['1', '2']);
  assert.deepEqual(first.next, { cycleIndex: 2, cursor: undefined });
  const second = await loadObservationProgressPage(['a', 'empty', 'b'], first.next, 2, fetch);
  assert.deepEqual(second.items.map(row => row.id), ['3', '4']);
  const last = await loadObservationProgressPage(['a', 'empty', 'b'], second.next, 2, fetch);
  assert.deepEqual(last.items.map(row => row.id), ['5']);
  assert.equal(last.next, null);
  assert.ok(calls.every(call => call.limit <= 3));
});

test('progress reads one bounded page from a large cycle instead of fetching every cycle', async () => {
  let calls = 0;
  const page = await loadObservationProgressPage(['a', 'b'], { cycleIndex: 0 }, 20, async (id, cursor, limit) => {
    calls++;
    assert.equal(id, 'a'); assert.equal(limit, 21);
    return { items: Array.from({ length: 21 }, (_, i) => ({ id: String(i) })), pageInfo: { hasMore: true, nextCursor: '20' } };
  });
  assert.equal(calls, 1);
  assert.equal(page.items.length, 20);
  assert.deepEqual(page.next, { cycleIndex: 0, cursor: '19' });
});

test('progress propagates failed requests and rejects a cursor that does not advance', async () => {
  await assert.rejects(loadObservationProgressPage(['a'], { cycleIndex: 0 }, 20, async () => { throw new Error('Unavailable'); }), /Unavailable/);
  await assert.rejects(loadObservationProgressPage(['a'], { cycleIndex: 0, cursor: 'same' }, 20, async () => ({ items: [], pageInfo: { hasMore: true, nextCursor: 'same' } })), /did not advance/);
  assert.deepEqual(await loadObservationProgressPage([], { cycleIndex: 0 }, 20, async () => assert.fail()), { items: [], next: null });
});
