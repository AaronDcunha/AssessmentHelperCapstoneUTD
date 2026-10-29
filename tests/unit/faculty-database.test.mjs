import test from 'node:test';
import assert from 'node:assert/strict';
import { facultySqlPool } from '../../src/server/db.ts';
test('Faculty SQL encodes UTC instants and parses legacy UTC timestamps/dates independently of host timezone', async () => {
  const calls = [], connection = { query: async config => { calls.push(config); return { rows: [] }; }, release() {} };
  const db = facultySqlPool({ ...connection, connect: async () => connection });
  const instant = new Date('2026-11-01T06:30:00Z');
  await db.query('SELECT $1', [instant]);
  assert.equal(calls[0].values[0], instant.toISOString());
  assert.equal(calls[0].types.getTypeParser(1114)('2026-11-01 06:30:00').toISOString(), instant.toISOString());
  assert.equal(calls[0].types.getTypeParser(1082)('2026-11-01').toISOString(), '2026-11-01T00:00:00.000Z');
  const client = await db.connect(); await client.query('SELECT $1', [instant]); client.release();
  assert.equal(calls[1].values[0], instant.toISOString());
});
