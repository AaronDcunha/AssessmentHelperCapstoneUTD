// Run against a development server with AUTH_DEMO_ENABLED=true.
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";

function client() {
  const cookies = new Map();
  return async (path, options = {}) => {
    const response = await fetch(`${base}${path}`, {
      ...options, redirect: "manual",
      headers: { ...options.headers, cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  };
}

async function login(request, username, password) {
  const { csrfToken } = await (await request("/api/auth/csrf")).json();
  return request("/api/auth/callback/credentials", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken, username, password, callbackUrl: `${base}/test` }),
  });
}

const anonymous = client();
assert.equal((await anonymous("/api/me")).status, 401);
assert.equal((await anonymous("/api/test/admin")).status, 401);
assert.equal((await anonymous("/test/faculty")).status, 307);

for (const role of ["faculty", "ac", "admin"]) {
  const request = client();
  await login(request, role, "123");
  const me = await request("/api/me");
  assert.equal(me.status, 200);
  assert.equal((await me.json()).username, role);
  for (const area of ["faculty", "ac", "admin"]) {
    const allowed = role === "admin" || role === area || (role === "ac" && area === "faculty");
    assert.equal((await request(`/api/test/${area}`)).status, allowed ? 200 : 403);
    const page = await request(`/test/${area}`);
    assert.equal(page.status, allowed ? 200 : 307);
    if (!allowed) assert.ok(page.headers.get("location").includes("/test/forbidden"));
  }
  const { csrfToken } = await (await request("/api/auth/csrf")).json();
  await request("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken }) });
  assert.equal((await request("/api/me")).status, 401);
}
const invalid = client();
await login(invalid, "someone", "123");
assert.equal((await invalid("/api/me")).status, 401);
await login(invalid, "faculty", "wrong");
assert.equal((await invalid("/api/me")).status, 401);
// Auth.js must reject credentials submitted without a CSRF token.
await invalid("/api/auth/callback/credentials", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ username: "faculty", password: "123" }) });
assert.equal((await invalid("/api/me")).status, 401);
console.log("Passed: anonymous access, three accounts, page/API permission matrix, unknown usernames, invalid passwords, CSRF, session persistence and logout.");
