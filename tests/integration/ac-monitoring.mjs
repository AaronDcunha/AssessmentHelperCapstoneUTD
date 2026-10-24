// Requires a running development server and existing seeded accounts. Read-only.
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const id = "00000000-0000-4000-8000-000000000000";
const paths = ["/ac", "/ac/faculty", "/ac/observations", `/ac/observations/${id}`, "/ac/reports",
  "/ac/cycles", "/ac/cycles/new", `/ac/cycles/${id}/edit`, "/ac/semester", "/ac/template"];
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
for (const path of paths) {
  const response = await client()(path);
  assert.equal(response.status, 307, path);
  assert.equal(new URL(response.headers.get("location"), base).pathname, "/login");
}
for (const [username, allowed] of [["alder_sol", false], ["amber_arrow", true], ["arden_stone", true]]) {
  const request = client();
  const csrfToken = (await (await request("/api/auth/csrf")).json()).csrfToken;
  await request("/api/auth/callback/credentials", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken, username, password: "123", callbackUrl: base }) });
  assert.equal((await request("/api/me")).status, 200, `Login ${username}`);
  for (const path of paths) {
    const response = await request(path);
    assert.equal(response.status, allowed ? 200 : 307, `${username} ${path}`);
    if (!allowed) assert.equal(new URL(response.headers.get("location"), base).pathname, "/forbidden");
  }
  const html = await (await request("/dashboard")).text();
  assert.equal(html.includes('href="/ac/reports"'), allowed, `${username} sidebar`);
}
console.log("Passed anonymous/Faculty/AC/Admin direct access for all 10 AC pages and permission-filtered navigation. Application records unchanged.");
