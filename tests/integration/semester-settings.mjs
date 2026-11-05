// Isolated local PostgreSQL schema only; application records are never modified.
import '../../scripts/server-loader.mjs';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
// Creation/configuration never touches attachment storage. Keep the deletion-only
// dependency out of this standalone runtime; fail if it is unexpectedly invoked.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === './faculty-attachments') return { url: 'data:text/javascript,export async function removeFacultyAttachmentFile(){throw new Error("Unexpected attachment cleanup");}', shortCircuit: true };
  return next(specifier, context);
} });
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
const { PrismaClient } = await import('../../src/generated/prisma/client.ts');
const { createSemester, configureSemester } = await import('../../src/server/services/semesters.ts');
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Requires local PostgreSQL.');
url.searchParams.delete('schema');
const schema = 'semester_settings_test_' + randomUUID().replaceAll('-', '');
const admin = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
const migrations = new pg.Pool({ connectionString: url.toString(), options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema }) });
const user = { id: randomUUID(), permissions: ['cycles.manage'] }, denied = { ...user, permissions: ['cycles.read'] };
const deadlines = { signupDeadline: '2027-02-01T12:00:00.123Z', observationDeadline: '2027-03-01T12:00:00Z', feedbackDeadline: '2027-04-01T12:00:00Z' };
const payload = { id: randomUUID(), year: 2027, season: 'Spring', startsOn: '2027-01-01', endsOn: '2027-05-31', timeZone: 'America/Chicago', deadlines };
let created = false;
try {
  await admin.query(`CREATE SCHEMA ${schema}`); created = true;
  for (const dir of (await readdir(new URL('../../prisma/migrations/', import.meta.url), { withFileTypes: true })).filter(d => d.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
    const sql = (await readFile(new URL(`../../prisma/migrations/${dir.name}/migration.sql`, import.meta.url), 'utf8')).replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
    await migrations.query(sql);
  }
  await assert.rejects(() => createSemester(db, denied, payload), e => e.status === 403);
  const result = await createSemester(db, user, payload);
  assert.equal(result.id, payload.id); assert.ok(result.cycle); assert.equal(result.cycle.signupDeadline, deadlines.signupDeadline);
  const retries = await Promise.all([createSemester(db, user, payload), createSemester(db, user, payload)]);
  assert.ok(retries.every(r => r.cycle.id === result.cycle.id));
  assert.equal(await db.semester.count(), 1); assert.equal(await db.evaluationCycle.count(), 1);
  await assert.rejects(() => createSemester(db, user, { ...payload, id: randomUUID() }), e => e.code === 'P2002');
  await assert.rejects(() => createSemester(db, user, { ...payload, timeZone: 'UTC' }), e => e.status === 409);
  const noCycle = await createSemester(db, user, { ...payload, id: randomUUID(), year: 2028, deadlines: undefined });
  assert.ok(!noCycle.cycle);
  const settings = { expectedRevision: 0, startsOn: '2028-01-01', endsOn: '2028-05-31', timeZone: 'UTC', deadlines };
  await assert.rejects(() => configureSemester(db, denied, noCycle.id, settings), e => e.status === 403);
  await assert.rejects(() => configureSemester(db, user, noCycle.id, { ...settings, expectedRevision: 1 }), e => e.status === 409);
  await assert.rejects(() => configureSemester(db, user, noCycle.id, { ...settings, deadlines: { ...deadlines, feedbackDeadline: deadlines.signupDeadline } }), e => e.status === 422);
  assert.equal(await db.evaluationCycle.count({ where: { semesterId: noCycle.id } }), 0);
  const configured = await configureSemester(db, user, noCycle.id, settings);
  assert.equal(configured.semester.revision, 1); assert.equal(configured.semester.timeZone, 'UTC');
  await assert.rejects(() => configureSemester(db, user, noCycle.id, settings), e => e.status === 409);
  assert.equal(await db.evaluationCycle.count({ where: { semesterId: noCycle.id } }), 1);
  // Force a cycle-insert failure after the semester write, verifying rollback.
  const rollback = await createSemester(db, user, { ...payload, id: randomUUID(), year: 2029, deadlines: undefined });
  const broken = { $transaction: (fn, options) => db.$transaction(tx => fn(new Proxy(tx, { get(target, key) {
    return key === 'evaluationCycle' ? { create: async () => { throw new Error('Injected failure'); } } : target[key];
  } })), options) };
  await assert.rejects(() => configureSemester(broken, user, rollback.id, settings), /Injected failure/);
  assert.equal((await db.semester.findUniqueOrThrow({ where: { semesterId: rollback.id } })).revision, 0);
  await assert.rejects(() => createSemester(broken, user, { ...payload, id: randomUUID(), year: 2030 }), /Injected failure/);
  assert.equal(await db.semester.count({ where: { termCode: '30s' } }), 0);
  console.log('Passed semester permissions, atomic create/configure rollback, exact deadlines, duplicate terms/cycles, creation replay and stale revisions.');
} finally {
  await db.$disconnect(); await migrations.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
