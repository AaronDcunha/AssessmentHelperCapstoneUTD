// Local development server only; sessions belong to this test and are discarded.
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname),
  "Only run against a local server",
);

function client() {
  const cookies = new Map();
  return async (path, options = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...options,
      redirect: "manual",
      headers: {
        ...options.headers,
        cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  };
}
const anonymous = client();
assert.equal((await anonymous("/api/me/observations")).status, 401);
for (const path of [
  "/observations/history",
  "/observations/history?state=ready",
  "/observations/history?state=empty",
  "/observations/history?state=denied",
]) {
  const response = await anonymous(path);
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), base).pathname, "/login");
}
for (const role of ["faculty", "ac", "admin"]) {
  const request = client();
  const { csrfToken } = await (await request("/api/auth/csrf")).json();
  await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({
      csrfToken,
      username: role,
      password: "123",
      callbackUrl: `${base}/observations/history`,
    }),
  });
  const response = await request("/observations/history");
  assert.equal(response.status, 200);
  const legacy = await request("/history");
  assert.equal(legacy.status, 307);
  assert.equal(new URL(legacy.headers.get("location"), base).pathname, "/observations/history");
  const html = await response.text();
  assert.match(html, /Observation History/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /skeletonRow/);
  assert.doesNotMatch(html, /Loading observation history/);
  assert.match(html, /data-navigation-item="faculty.history"/);
  assert.match(html, /data-navigation-item="faculty.dashboard"/);
  assert.match(html, /data-navigation-item="faculty.observations"/);
  if (role !== "admin") assert.doesNotMatch(html, /data-navigation-section="(?:ac|admin)"/);
  assert.doesNotMatch(html, /Local preview/);
  const history = await request("/api/me/observations");
  assert.equal(history.status, 200);
  assert.match(history.headers.get("cache-control"), /no-store/);
  const payload = await history.json();
  assert.equal(payload.dataSource, undefined);
  assert.deepEqual(payload.items, []);
  assert.deepEqual(payload.pageInfo, { hasMore: false, nextCursor: null });
  const filtered = await (
    await request("/api/me/observations?participation=observer&limit=1")
  ).json();
  assert.deepEqual(filtered.items, []);
  assert.deepEqual(filtered.pageInfo, { hasMore: false, nextCursor: null });
  const badQuery = await request("/api/me/observations?userId=someone-else");
  assert.equal(badQuery.status, 400);
  assert.equal((await badQuery.json()).error.code, "INVALID_QUERY");
  const signout = await (await request("/api/auth/csrf")).json();
  await request("/api/auth/signout", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken: signout.csrfToken }),
  });
  assert.equal((await request("/observations/history")).status, 307);
  assert.equal((await request("/api/me/observations")).status, 401);
}
console.log(
  "Passed: history page/API authentication, three roles, no dummy records, no-store, rejected identity parameters, and logout.",
);
