// Upgrade real legacy rows in a disposable schema; never migrate the app database.
import '../../scripts/server-loader.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
const { PrismaClient } = await import('../../src/generated/prisma/client.ts');
const connectionUrl = new URL(process.env.DATABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(connectionUrl.hostname));
connectionUrl.searchParams.delete('schema');
const schema = 'recommendation_migration_' + randomUUID().replaceAll('-', '');
const admin = new pg.Pool({ connectionString: connectionUrl.toString(), connectionTimeoutMillis: 5000 });
const pool = new pg.Pool({ connectionString: connectionUrl.toString(), options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionUrl.toString() }, { schema }) });
const migrationName = '20261028040000_recommendation_lists';
let created = false;
try {
  await admin.query(`CREATE SCHEMA ${schema}`); created = true;
  const root = new URL('../../prisma/migrations/', import.meta.url);
  const migrations = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const sql = async name => (await readFile(new URL(`${name}/migration.sql`, root), 'utf8')).replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
  for (const name of migrations.filter(name => name < migrationName)) await pool.query(await sql(name));
  const users = Array.from({ length: 6 }, () => randomUUID()), professors = users.map(() => randomUUID());
  const observations = users.map(() => randomUUID()), signups = users.map(() => randomUUID());
  const departmentId = randomUUID(), hiringLevelId = randomUUID(), semesterId = randomUUID(), cycleId = randomUUID(), courseId = randomUUID(), sectionId = randomUUID();
  await db.appUser.createMany({ data: users.map((userId, i) => ({ userId, fullName: `Legacy ${i}`, email: `legacy${i}@test.invalid` })) });
  await db.department.create({ data: { departmentId, departmentName: 'Legacy CS' } });
  await db.hiringLevel.create({ data: { hiringLevelId, levelName: 'Assistant', evaluationIntervalYears: 1 } });
  await db.professor.createMany({ data: professors.map((professorId, i) => ({ professorId, userId: users[i], departmentId, hiringLevelId })) });
  await db.semester.create({ data: { semesterId, termCode: '26f', termName: 'Fall 2026' } });
  await db.evaluationCycle.create({ data: { cycleId, semesterId, cycleName: 'Legacy', signupDeadline: new Date('2026-10-01'), observationDeadline: new Date('2026-12-01'), feedbackDeadline: new Date('2026-12-15') } });
  await db.course.create({ data: { courseId, departmentId, courseCode: 'CS 4000', courseTitle: 'Legacy', courseLevel: 4000 } });
  await db.courseSection.create({ data: { sectionId, courseId, semesterId, sectionCode: '001' } });
  const generationId = randomUUID(), releasedAt = new Date('2026-10-10T12:00:00Z');
  for (let i = 0; i < observations.length; i++) {
    await db.evaluationSignup.create({ data: { signupId: signups[i], cycleId, professorId: professors[i], sectionId } });
    await pool.query(`INSERT INTO observation(observation_id, signup_id, cycle_id, recommendation_generation_id, recommendations_released_at, observer_id, scheduled_at, status, completed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [observations[i], signups[i], cycleId, [0, 1, 5].includes(i) ? generationId : null,
      [0, 3, 5].includes(i) ? releasedAt : null, [0, 5].includes(i) ? professors[1] : null,
      [0, 5].includes(i) ? new Date('2026-10-20T16:00:00Z') : null, i === 5 ? 'COMPLETED' : i === 0 ? 'CONFIRMED' : 'PENDING', i === 5 ? new Date('2026-10-20T17:00:00Z') : null]);
  }
  const candidates = [randomUUID(), randomUUID(), randomUUID()];
  for (const [i, observationIndex, status] of [[0, 0, 'SELECTED'], [1, 2, 'EXPIRED'], [2, 5, 'SELECTED']]) {
    await pool.query(`INSERT INTO observation_candidate(candidate_id, observation_id, professor_id, status, invited_at, expires_at, responded_at)
      VALUES($1,$2,$3,$4,'2026-10-11T12:00:00','2026-10-13T12:00:00',$5)`, [candidates[i], observations[observationIndex], professors[1], status, i === 1 ? null : new Date('2026-10-12T12:00:00Z')]);
    await db.invitationAttempt.create({ data: { attemptId: candidates[i], candidateId: candidates[i], number: 1, status: i === 1 ? 'EXPIRED' : 'ACCEPTED',
      invitedAt: new Date('2026-10-11T12:00:00Z'), expiresAt: new Date('2026-10-13T12:00:00Z'), respondedAt: i === 1 ? null : new Date('2026-10-12T12:00:00Z') } });
  }
  await db.lateAcceptanceApproval.create({ data: { attemptId: candidates[1], reason: 'Retain this pending request' } });
  const template = await db.observationTemplate.create({ data: { templateName: 'Legacy form' } });
  for (const i of [0, 5]) await db.signedAssessment.create({ data: { observationId: observations[i], templateId: template.templateId,
    responses: { answers: {}, comments: 'Preserve exactly' }, observerSignedAt: releasedAt, observeeSignedAt: i === 5 ? releasedAt : null, isLocked: i === 5 } });
  const snapshot = async () => {
    const rows = await pool.query(`SELECT jsonb_build_object(
      'observations',(SELECT jsonb_agg(to_jsonb(o) - 'current_draft_list_id' - 'current_released_list_id' ORDER BY observation_id) FROM observation o),
      'candidates',(SELECT jsonb_agg(to_jsonb(c) - 'recommendation_list_id' ORDER BY candidate_id) FROM observation_candidate c),
      'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY attempt_id) FROM invitation_attempt a),
      'approvals',(SELECT jsonb_agg(to_jsonb(a) ORDER BY approval_id) FROM late_acceptance_approval a),
      'assessments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY assessment_id) FROM signed_assessment a)) AS data`);
    return rows.rows[0].data;
  };
  const before = await snapshot();
  await pool.query(await sql(migrationName));
  assert.deepEqual(await snapshot(), before);
  const constraints = await pool.query(`SELECT conname, confupdtype, confdeltype FROM pg_constraint
    WHERE connamespace = $1::regnamespace AND conname = ANY($2::text[])`, [schema, [
    'recommendation_list_observation_id_fkey', 'observation_candidate_recommendation_list_id_observation_i_fkey',
    'observation_current_draft_list_id_observation_id_fkey', 'observation_current_released_list_id_observation_id_fkey',
  ]]);
  assert.equal(constraints.rows.length, 4);
  assert.ok(constraints.rows.every(row => row.confupdtype === 'a' && row.confdeltype === 'r'));
  const lists = await db.recommendationList.findMany();
  assert.equal(lists.length, 5); // Two released, one released empty, one draft empty, one unclassified.
  assert.ok(lists.every(list => list.origin === 'LEGACY_IMPORT' && list.generatedAt === null));
  for (const i of [0, 3, 5]) {
    const record = await db.observation.findUnique({ where: { observationId: observations[i] } });
    assert.equal(record.currentReleasedListId, observations[i]); assert.equal(record.currentDraftListId, null);
    assert.equal(lists.find(list => list.listId === observations[i]).publishedAt.toISOString(), releasedAt.toISOString());
  }
  assert.equal((await db.observation.findUnique({ where: { observationId: observations[1] } })).currentDraftListId, observations[1]);
  for (const i of [2, 4]) {
    const record = await db.observation.findUnique({ where: { observationId: observations[i] } });
    assert.equal(record.currentDraftListId, null); assert.equal(record.currentReleasedListId, null);
  }
  assert.equal(lists.find(list => list.listId === observations[2]).generationId, null);
  assert.equal(lists.find(list => list.listId === observations[2]).publishedAt, null);
  assert.equal(await db.observationCandidate.count({ where: { recommendationListId: observations[2] } }), 1);
  const replacement = await db.recommendationList.create({ data: { observationId: observations[0] } });
  await db.observationCandidate.create({ data: { observationId: observations[0], recommendationListId: replacement.listId, professorId: professors[1] } });
  assert.equal(await db.observationCandidate.count({ where: { observationId: observations[0], professorId: professors[1] } }), 2);
  await assert.rejects(db.observationCandidate.create({ data: { observationId: observations[0], recommendationListId: replacement.listId, professorId: professors[1] } }), error => error.code === 'P2002');
  await assert.rejects(db.observationCandidate.create({ data: { observationId: observations[1], recommendationListId: replacement.listId, professorId: professors[2] } }), error => error.code === 'P2003');
  await assert.rejects(db.observation.update({ where: { observationId: observations[1] }, data: { currentDraftListId: replacement.listId } }), error => error.code === 'P2003');
  await assert.rejects(db.observation.update({ where: { observationId: observations[1] }, data: { currentReleasedListId: replacement.listId } }), error => error.code === 'P2003');
  console.log('Passed legacy recommendation upgrade: exact record/history/assessment preservation, nullable unknown metadata, empty lists, unclassified fail-closed imports, per-list uniqueness and cross-observation FK isolation.');
} finally {
  await db.$disconnect(); await pool.end();
  if (created) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
}
