// Read-only verification against the running app and seeded Docker PostgreSQL.
import assert from "node:assert/strict";

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const missingId = "00000000-0000-4000-8000-000000000000";

function client() {
  const cookies = new Map();
  return async (path, options = {}) => {
    const response = await fetch(base + path, { ...options, redirect: "manual",
      headers: { ...options.headers, cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") } });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0], split = pair.indexOf("=");
      cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    return response;
  };
}

async function login(request, username) {
  const csrfToken = (await (await request("/api/auth/csrf")).json()).csrfToken;
  await request("/api/auth/callback/credentials", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken, username, password: "123", callbackUrl: base }) });
  assert.equal((await request("/api/me")).status, 200, `Unable to log in as ${username}`);
}

const anonymous = client();
assert.equal((await anonymous(`/api/evaluation-cycles/${missingId}/reports`)).status, 401);

const faculty = client();
await login(faculty, "alder_sol");
assert.equal((await faculty(`/api/evaluation-cycles/${missingId}/reports`)).status, 403);

const request = client();
await login(request, "amber_arrow");
const cyclesResponse = await request("/api/evaluation-cycles");
assert.equal(cyclesResponse.status, 200);
const cycles = await cyclesResponse.json();
assert.ok(cycles.items.length > 0, "A database evaluation cycle is required.");
const cycleId = cycles.items[0].id;
const paths = ["reports", "faculty-status", "attention", "observations", "metrics", "signups"];
for (const path of paths) {
  const response = await request(`/api/evaluation-cycles/${cycleId}/${path}`);
  assert.equal(response.status, 200, path);
  const json = await response.json();
  assert.equal(JSON.stringify(json).includes('"demo"'), false, `${path} returned demo data`);
}
for (const path of ["", "/candidates", "/template", "/assessment"]) {
  assert.equal((await request(`/api/observations/${missingId}${path}`)).status, 404, `missing observation ${path}`);
}

console.log("Passed authorized Docker-database AC reads with no frontend demo records. No application records modified.");
