// Existing seeded data only. Rejected POSTs exercise validation; no fixtures or business records are written.
import assert from 'node:assert/strict';
import pg from 'pg';

const base = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const url = new URL(process.env.DATABASE_URL); url.searchParams.delete('schema');
const db = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
function session() {
  const cookies = new Map();
  return async (path, options = {}) => {
    const response = await fetch(`${base}${path}`, { ...options, redirect: 'manual', headers: { ...options.headers, cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0], index = pair.indexOf('='); cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
    if (!path.startsWith('/api/auth/')) assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    return response;
  };
}
await db.connect();
try {
  await db.query('BEGIN READ ONLY');
  for (const path of ['/api/me/dashboard/workflow', '/api/me/dashboard/assessment']) assert.equal((await session()(path)).status, 401);
  for (const username of ['alder_sol', 'arden_stone']) {
    const request = session();
    const token = (await (await request('/api/auth/csrf')).json()).csrfToken;
    await request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' }, body: new URLSearchParams({ username, password: '123', csrfToken: token, callbackUrl: `${base}/dashboard` }) });
    const identity = await (await request('/api/me')).json(); assert.equal(identity.username, username);
    const response = await request('/api/me/dashboard/workflow'); assert.equal(response.status, 200);
    const data = await response.json();
    const expected = await db.query(`SELECT cs.section_id FROM public.teaches t JOIN public.professor p ON p.professor_id = t.professor_id
      JOIN public.course_section cs ON cs.section_id = t.section_id WHERE p.user_id = $1 AND cs.semester_id = $2`, [identity.id, data.dashboard.cycle?.semesterId]);
    assert.deepEqual(data.sections.map(item => item.id).sort(), expected.rows.map(item => item.section_id).sort());
    for (const section of data.sections) {
      const meetings = await db.query('SELECT meeting_id, day_of_week, start_time, end_time FROM public.class_meeting WHERE section_id = $1', [section.id]);
      assert.deepEqual(section.meetings.map(item => item.id).sort(), meetings.rows.map(item => item.meeting_id).sort());
      for (const option of section.options) {
        assert.ok(option.date < data.signup.observationDeadline);
        const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${option.date}T12:00:00Z`));
        assert.equal(meetings.rows.filter(item => item.day_of_week === weekday).length, 1);
      }
    }
    const other = await db.query('SELECT user_id FROM public.app_user WHERE user_id <> $1 LIMIT 1', [identity.id]);
    const spoofed = await (await request(`/api/me/dashboard/workflow?userId=${other.rows[0].user_id}&role=Admin`)).json();
    assert.deepEqual(spoofed.sections, data.sections);
    for (const path of ['/dashboard/evaluation', '/observations/signup', '/observations', '/observations/details', '/observations/appointment', '/observations/requests', '/observations/form']) {
      const page = await request(path); assert.equal(page.status, 200, path);
      const html = await page.text();
      if (path === '/observations/signup') assert.deepEqual([...html.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]).sort(), data.sections.map(section => section.id).sort());
      if (path === '/dashboard/evaluation' && data.dashboard.cycle) assert.ok(html.includes(data.dashboard.cycle.semester));
      if (path === '/observations/details' && !data.observation) assert.ok(html.includes('No current observation is available'));
      if (path === '/observations/form') assert.ok(html.includes('No observation form is available'));
    }
    const formResponse = await request('/api/me/dashboard/assessment'); assert.equal(formResponse.status, 200);
    assert.equal((await formResponse.json()).form, null); // Current seed has no observations.
    const post = (path, body, origin = base) => request(`/api/me/dashboard/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body) });
    const malformed = await post('signup', { sectionId: 'invalid', dates: [] });
    assert.equal(malformed.status, 400, await malformed.text());
    assert.equal((await post('signup', {}, 'https://other.example')).status, 403);
    if (data.sections.length && !data.signup.allowed) {
      const invalidSignup = await post('signup', { sectionId: data.sections[0].id, dates: [data.sections[0].options[0]?.date ?? '2026-10-19'] });
      assert.equal(invalidSignup.status, 409);
    }
    assert.equal((await post('requests/decline', { candidateId: '11111111-1111-4111-8111-111111111111' })).status, 409);
    assert.equal((await post('assessment', { action: 'acknowledge', revision: 'none', acknowledged: true })).status, 409);
    const csrf = (await (await request('/api/auth/csrf')).json()).csrfToken;
    await request('/api/auth/signout', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken: csrf }) });
    assert.equal((await request('/api/me/dashboard/workflow')).status, 401);
  }
  console.log('Passed seeded own-course dropdowns, weekly schedules/calendar options, linked Faculty routes, no-store, identity isolation, and rejected unsafe/unavailable mutations. No History requests or database writes.');
} finally { await db.query('ROLLBACK'); await db.end(); }
