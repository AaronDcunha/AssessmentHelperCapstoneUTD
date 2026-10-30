// Read-only checks against the existing seeded database and a running app.
// Creates/clears authentication cookies only; no business fixtures are written.
import assert from 'node:assert/strict';
import pg from 'pg';
import { facultyEligibility } from '../../src/server/services/faculty-evaluation.ts';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete('schema');
const db = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
function sessionClient() {
  const cookies = new Map();
  return async (path, options = {}) => {
    const response = await fetch(`${base}${path}`, { ...options, redirect: 'manual',
      headers: { ...options.headers, cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0], index = pair.indexOf('=');
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  };
}
const noStore = response => assert.match(response.headers.get('cache-control') ?? '', /no-store/);
await db.connect();
try {
  await db.query('BEGIN READ ONLY');
  const anonymous = await sessionClient()('/api/me/dashboard');
  assert.equal(anonymous.status, 401); noStore(anonymous);
  const page = await sessionClient()('/dashboard');
  assert.equal(page.status, 307);
  assert.equal(new URL(page.headers.get('location'), base).pathname, '/login');
  for (const username of ['alder_sol', 'arden_stone']) {
    const request = sessionClient();
    const csrfToken = (await (await request('/api/auth/csrf')).json()).csrfToken;
    await request('/api/auth/callback/credentials', { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
      body: new URLSearchParams({ csrfToken, username, password: '123', callbackUrl: `${base}/dashboard` }) });
    const identity = await request('/api/me'); assert.equal(identity.status, 200);
    const user = await identity.json(); assert.equal(user.username, username);
    const response = await request('/api/me/dashboard');
    assert.equal(response.status, 200); noStore(response);
    const data = await response.json();
    const profile = await db.query(`SELECT h.level_name FROM public.professor p
      JOIN public.hiring_level h ON h.hiring_level_id = p.hiring_level_id WHERE p.user_id = $1`, [user.id]);
    assert.equal(data.hasFacultyProfile, !!profile.rows.length);
    assert.equal(data.evaluation.hiringLevel, profile.rows[0]?.level_name ?? null);
    const other = await db.query('SELECT user_id FROM public.app_user WHERE user_id <> $1 LIMIT 1', [user.id]);
    const spoofedResponse = await request(`/api/me/dashboard?userId=${other.rows[0].user_id}&professorId=${other.rows[0].user_id}&role=Admin`);
    assert.equal(spoofedResponse.status, 200); noStore(spoofedResponse);
    const spoofed = await spoofedResponse.json();
    assert.deepEqual({ ...spoofed, asOf: null }, { ...data, asOf: null }, 'Browser identity parameters must not affect the summary');
    if (data.evaluation.lastCompletedEvaluation) {
      const own = await db.query(`SELECT 1 FROM public.observation o
        JOIN public.evaluation_signup es ON es.signup_id = o.signup_id
        JOIN public.professor p ON p.professor_id = es.professor_id
        JOIN public.signed_assessment a ON a.observation_id = o.observation_id
        WHERE o.observation_id = $1 AND p.user_id = $2 AND a.is_locked
          AND a.observer_signed_at IS NOT NULL AND a.observee_signed_at IS NOT NULL`, [data.evaluation.lastCompletedEvaluation.observationId, user.id]);
      assert.equal(own.rows.length, 1);
    } else {
      const evidence = await db.query(`SELECT p.hire_date, h.evaluation_interval_years,
        ARRAY(SELECT DISTINCT s.term_code FROM public.teaches t JOIN public.course_section cs ON cs.section_id=t.section_id
          JOIN public.semester s ON s.semester_id=cs.semester_id WHERE t.professor_id=p.professor_id) AS terms
        FROM public.professor p JOIN public.hiring_level h ON h.hiring_level_id=p.hiring_level_id WHERE p.user_id=$1`,[user.id]);
      const row=evidence.rows[0];
      const expected=facultyEligibility(data.cycle,null,row?.evaluation_interval_years??null,row?.hire_date?new Date(row.hire_date):null,row?.terms??[]);
      assert.equal(data.evaluation.status,expected.status);
    }
    if (data.currentObservation) {
      const own = await db.query(`SELECT 1 FROM public.observation o
        JOIN public.evaluation_signup es ON es.signup_id = o.signup_id
        JOIN public.professor observee ON observee.professor_id = es.professor_id
        LEFT JOIN public.professor observer ON observer.professor_id = o.observer_id
        WHERE o.observation_id = $1 AND (observee.user_id = $2 OR observer.user_id = $2)`, [data.currentObservation.id, user.id]);
      assert.equal(own.rows.length, 1);
    }
    for (const item of data.recentActivity) {
      const own = await db.query('SELECT 1 FROM public.notification WHERE notification_id = $1 AND user_id = $2', [item.id, user.id]);
      assert.equal(own.rows.length, 1);
    }
    const empty = await db.query('SELECT count(*)::int AS count FROM public.observation');
    if (empty.rows[0].count === 0) {
      assert.equal(data.currentObservation, null);
      assert.equal(data.pendingObserverRequestCount, 0);
      assert.equal(data.evaluation.lastCompletedEvaluation, null);
    }
    const dashboard = await request('/dashboard');
    assert.equal(dashboard.status, 200); noStore(dashboard);
    const html = await dashboard.text();
    if (!data.currentObservation) assert.ok(html.includes('No current observation'));
    assert.ok(html.includes(`${data.pendingObserverRequestCount} pending`));
    if (!data.recentActivity.length) assert.ok(html.includes('No recent activity'));
    assert.ok(html.includes('href="/observations/history"'), 'History navigation must remain unchanged');
    const token = (await (await request('/api/auth/csrf')).json()).csrfToken;
    await request('/api/auth/signout', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken: token }) });
    const loggedOut = await request('/api/me/dashboard'); assert.equal(loggedOut.status, 401); noStore(loggedOut);
  }
  console.log('Passed seeded Faculty/Admin own dashboard data, identity-spoof rejection, no-store page/API, seeded empty states, login/logout, and unchanged History link. Database unchanged.');
} finally {
  await db.query('ROLLBACK');
  await db.end();
}
