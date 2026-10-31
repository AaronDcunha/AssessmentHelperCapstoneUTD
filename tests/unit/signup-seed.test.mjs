import '../../scripts/server-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { seedSignups, demoSignupNames } = await import('../../prisma/seed-signups.mjs');
import { stableId } from '../../prisma/seed-data.mjs';

function database() {
  const now = new Date('2026-10-30T12:00:00Z');
  const semester = { semesterId: 'semester', termCode: '26f', termName: 'Fall 2026', startsOn: new Date('2026-08-31'), endsOn: new Date('2026-12-16'), timeZone: 'America/Chicago' };
  const cycle = { cycleId: 'cycle', semesterId: 'semester', semester, signupDeadline: new Date('2026-10-28'), observationDeadline: new Date('2026-11-30') };
  const faculty = new Map(demoSignupNames.map(name => {
    const professorId = stableId(`professor:${name.toLowerCase().replaceAll(' ', '_')}`);
    return [professorId, { professorId, hireDate: new Date('2020-01-01'), user: { fullName: name, isActive: true }, hiringLevel: { evaluationIntervalYears: 1 }, teaches: [{ section: { sectionId: `section-${professorId}`, sectionCode: '001', semesterId: 'semester', semester, course: { courseCode: 'CS 4000' }, classMeetings: [{ meetingId: 'meeting', dayOfWeek: 'Monday', startTime: '10:00', endTime: '11:00', location: 'Room' }] } }] }];
  }));
  let records = { signups: [], observations: [], options: [] };
  const db = {
    evaluationCycle: { findMany: async () => [cycle] },
    professor: { findUniqueOrThrow: async ({ where }) => faculty.get(where.professorId) },
    evaluationSignup: {
      findUnique: async ({ where }) => records.signups.find(s => s.professorId === where.cycleId_professorId.professorId && s.cycleId === where.cycleId_professorId.cycleId),
      create: async ({ data }) => { records.signups.push(data); },
    },
    observation: { findMany: async () => [], create: async ({ data }) => { records.observations.push(data); } },
    observationTimeOption: { create: async ({ data }) => { records.options.push(data); } },
  };
  return { now, faculty, records: () => records, prisma: { $transaction: async (action, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const previous = structuredClone(records);
    try { return await action(db); } catch (error) { records = previous; throw error; }
  } } };
}

test('team signup preview writes nothing; seed creates exactly ten signup-only records and thirty meetings', async () => {
  const f = database();
  const preview = await seedSignups(f.prisma, { now: f.now, dryRun: true });
  assert.equal(preview.rows.length, 10);
  assert.equal(f.records().signups.length, 0);
  const result = await seedSignups(f.prisma, { now: f.now });
  assert.deepEqual(result.rows.map(r => r.signupId), preview.rows.map(r => r.signupId));
  assert.equal(f.records().signups.length, 10);
  assert.equal(f.records().observations.length, 10);
  assert.equal(f.records().options.length, 30);
  assert.ok(f.records().observations.every(o => o.status === 'PENDING' && !o.observerId && !o.recommendationGenerationId));
});

test('rerunning preserves existing signups and later workflow progress without adding replacements', async () => {
  const f = database();
  await seedSignups(f.prisma, { now: f.now });
  f.records().observations[0].status = 'COMPLETED';
  const previous = structuredClone(f.records());
  const result = await seedSignups(f.prisma, { now: f.now });
  assert.ok(result.rows.every(r => r.action === 'preserved existing signup'));
  assert.deepEqual(f.records(), previous);
});

test('an invalid professor rolls back the entire fixture batch', async () => {
  const f = database();
  [...f.faculty.values()].at(-1).user.isActive = false;
  await assert.rejects(seedSignups(f.prisma, { now: f.now }), /inactive/);
  assert.deepEqual(f.records(), { signups: [], observations: [], options: [] });
});
