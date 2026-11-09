// All writes use a disposable local schema; application tables are untouched.
import '../configuration-loader.mjs';
import { registerHooks } from 'node:module';
// Creation tests never delete files; fail if file cleanup is unexpectedly invoked.
registerHooks({ resolve(specifier, context, next) {
  if (specifier === './faculty-attachments' && context.parentURL?.endsWith('/services/semesters.ts')) return { url: 'data:text/javascript,export async function removeFacultyAttachmentFile(){throw new Error("Unexpected attachment cleanup in creation test")}', shortCircuit: true };
  return next(specifier, context);
} });
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
const { PrismaClient } = await import('../../src/generated/prisma/client.ts');
const { createSemester } = await import('../../src/server/services/semesters.ts');
const { createCycle } = await import('../../src/server/services/configuration.ts');
const url = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
url.searchParams.delete('schema');
const schema = 'semester_settings_test_' + randomUUID().replaceAll('-', '');
const admin = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
const setup = new pg.Pool({ connectionString: url.toString(), options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema }) });
const user = { id: randomUUID(), permissions: ['cycles.manage'] };
const dates = { startsOn: '2028-08-21', endsOn: '2028-12-15', timeZone: 'America/Chicago' };
const deadlines = { signupDeadline: '2028-08-21T17:00:00.000Z', observationDeadline: '2028-12-15T18:00:00.000Z', feedbackDeadline: '2028-12-22T18:00:00.000Z' };
let created = false;
try {
  await admin.query(`CREATE SCHEMA ${schema}`); created = true;
  for (const migration of ['20261019000000_initial_schema', '20261023000000_ac_configuration']) {
    const sql = (await readFile(new URL(`../../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8')).replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
    await setup.query(sql);
  }
  const payload = { year: 2028, season: 'Fall', ...dates, deadlines, creationId: randomUUID() };
  await assert.rejects(() => createSemester(prisma, { ...user, permissions: [] }, payload), e => e.status === 403);
  const saved = await createSemester(prisma, user, payload);
  assert.equal((await createSemester(prisma, user, payload)).id, saved.id);
  assert.equal(await prisma.semester.count(), 1); assert.equal(await prisma.evaluationCycle.count(), 1);
  await assert.rejects(() => createSemester(prisma, user, { ...payload, endsOn: '2028-12-16' }), e => e.code === 'CREATION_KEY_REUSED');
  await assert.rejects(() => createSemester(prisma, user, { ...payload, creationId: randomUUID() }), e => e.code === 'P2002');
  // Force the cycle write to fail after semester insertion; no partial semester survives.
  const failedId = randomUUID();
  await setup.query(`ALTER TABLE "evaluation_cycle" ADD CONSTRAINT reject_test_cycle CHECK ("cycle_name" <> 'Spring 2029')`);
  await assert.rejects(() => createSemester(prisma, user, { ...payload, year: 2029, season: 'Spring', creationId: failedId }));
  assert.equal(await prisma.semester.findUnique({ where: { semesterId: failedId } }), null);
  await setup.query(`ALTER TABLE "evaluation_cycle" DROP CONSTRAINT reject_test_cycle`);
  const legacy = await createSemester(prisma, user, { year: 2029, season: 'Spring', ...dates });
  const cyclePayload = { semesterId: legacy.id, ...deadlines, semester: dates, expectedSemesterRevision: 0, creationId: randomUUID() };
  await assert.rejects(() => createCycle(prisma, user, { ...cyclePayload, expectedSemesterRevision: 99 }), e => e.status === 409);
  assert.equal(await prisma.evaluationCycle.count({ where: { semesterId: legacy.id } }), 0);
  const cycle = await createCycle(prisma, user, cyclePayload);
  assert.equal(cycle.semester.revision, 1);
  assert.equal((await createCycle(prisma, user, cyclePayload)).id, cycle.id);
  await assert.rejects(() => createCycle(prisma, user, { ...cyclePayload, feedbackDeadline: '2028-12-23T18:00:00.000Z' }), e => e.code === 'CREATION_KEY_REUSED');
  const before = await prisma.semester.findUnique({ where: { semesterId: legacy.id } });
  await assert.rejects(() => createCycle(prisma, user, { ...cyclePayload, creationId: randomUUID(), expectedSemesterRevision: 1, semester: { ...dates, endsOn: '2028-12-16' } }), e => e.code === 'P2002');
  assert.deepEqual(await prisma.semester.findUnique({ where: { semesterId: legacy.id } }), before);
  console.log('Semester settings: atomic creation, replay, duplicate prevention, permissions, stale revisions and rollback passed.');
} finally {
  await prisma.$disconnect(); await setup.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
