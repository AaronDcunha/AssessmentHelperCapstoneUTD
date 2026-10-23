// Dependency-free browser verification. Requires a built/running local app and an isolated
// headless Chrome/Edge instance with --remote-debugging-port=9223. Seeded login is read
// from the ignored credential file; secrets/cookies never enter output. Business API
// requests are intercepted in this browser target only, including every mutation.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
assert.equal(new URL(base).hostname, "localhost", "Use an isolated localhost test server.");
const debug = process.env.TEST_CDP_URL ?? "http://127.0.0.1:9223";
const credentials = readFileSync(new URL("../../prisma/demo-accounts.txt", import.meta.url), "utf8");
async function login(role) {
  const section = credentials.split(new RegExp(`^${role}:`, "m"))[1]?.split(/\r?\n\r?\n/)[0];
  const username = section?.match(/^Username: (.+)$/m)?.[1].trim();
  const password = section?.match(/^Password: (.+)$/m)?.[1].trim();
  assert.ok(username && password, "Ignored seeded credentials are required.");
  const jar = new Map();
  async function request(path, options = {}) {
    const result = await fetch(`${base}${path}`, { ...options, redirect: "manual", headers: {
      ...options.headers, Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
    } });
    for (const cookie of result.headers.getSetCookie()) {
      const pair = cookie.split(";")[0]; const index = pair.indexOf("=");
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return result;
  }
  const csrfToken = (await (await request("/api/auth/csrf")).json()).csrfToken;
  await request("/api/auth/callback/credentials", { method: "POST", headers: {
    "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1",
  }, body: new URLSearchParams({ username, password, csrfToken, callbackUrl: base }) });
  assert.equal((await request("/api/me")).status, 200, "Seeded login must succeed.");
  return { jar, request };
}
for (const route of ["/admin/users/new", "/admin/users/fixture-user"]) {
  const response = await fetch(`${base}${route}`, { redirect: "manual" });
  assert.equal(response.status, 307); assert.equal(new URL(response.headers.get("location"), base).pathname, "/login");
}
for (const role of ["Faculty", "AC"]) {
  const { request } = await login(role);
  for (const route of ["/admin/users/new", "/admin/users/fixture-user"]) {
    const response = await request(route);
    assert.equal(response.status, 307); assert.equal(new URL(response.headers.get("location"), base).pathname, "/forbidden");
  }
}
const { jar } = await login("Admin");
const target = await (await fetch(`${debug}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
const handlers = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const promise = pending.get(message.id); pending.delete(message.id);
    if (message.error) promise?.reject(new Error("Browser protocol request failed.")); else promise?.resolve(message.result);
  } else handlers.get(message.method)?.(message.params);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })); });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!result.exceptionDetails, "Browser evaluation must succeed.");
  return result.result?.value;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(50); }
  throw new Error(`Browser condition timed out: ${expression}`);
}
async function navigate(path) { await send("Page.navigate", { url: `${base}${path}` }); await wait(`location.pathname === ${JSON.stringify(path)} && document.readyState === 'complete'`); }
async function value(name, next) {
  await evaluate(`(() => { const e = document.querySelector('[name="${name}"]'); const setter = Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set; setter.call(e, ${JSON.stringify(next)}); e.dispatchEvent(new Event(e instanceof HTMLSelectElement ? 'change' : 'input', {bubbles:true})); })()`);
}
async function click(text) { assert.ok(await evaluate(`(() => { const e = [...document.querySelectorAll('button')].find(e => e.textContent === ${JSON.stringify(text)}); if (!e || e.disabled) return false; e.click(); return true; })()`), "Expected an enabled button."); }
const list = items => ({ items, pageInfo: { nextCursor: null, hasMore: false } });
const roles = [{ id: "r1", name: "Role One" }, { id: "r2", name: "Role Two" }, { id: "r3", name: "Role Three" }];
const initial = { id: "fixture-user", name: "Fixture Person", email: "fixture@example.test", accountStatus: "api-status",
  roleIds: ["r1", "r2"], professor: { departmentId: "d1", hiringLevelId: "h1", hireDate: "2025-01-15" }, revision: 1 };
let record = structuredClone(initial), mode = "normal", requests = [], fixtureFailure;
handlers.set("Fetch.requestPaused", async event => {
  try {
    const path = new URL(event.request.url).pathname, method = event.request.method;
    let status = 200, body;
    if (mode === "unavailable") { status = 404; body = { error: { code: "UNAVAILABLE" } }; }
    else if (method === "GET") {
      if (path === "/api/roles") body = list(roles);
      else if (path === "/api/departments") body = list([{ id: "d1", code: "TEST", name: "Test Department" }]);
      else if (path === "/api/hiring-levels") body = { items: [{ id: "h1", name: "Test Level", active: true }] };
      else if (path === "/api/users") body = list([{ ...record, roles }]);
      else if (path === "/api/users/fixture-user") body = mode === "malformed" ? { ...record, revision: undefined } : record;
      else throw new Error("Unexpected fixture read.");
    } else {
      const input = event.request.postData ? JSON.parse(event.request.postData) : undefined;
      requests.push({ method, input });
      if (mode === "conflict" && method === "PATCH") { status = 409; body = { error: { code: "STALE_REVISION" } }; mode = "normal"; record.revision++; record.email = "concurrent@example.test"; }
      else if (mode === "roles-fail" && method === "PUT") { status = 422; body = { error: { code: "VALIDATION", fieldErrors: { roleIds: ["Fixture role rejection"] } } }; mode = "normal"; }
      else if (method === "POST" && path === "/api/users") { await pause(250); record = { ...initial, ...input }; status = 201; body = record; }
      else if (method === "PATCH" && path === "/api/users/fixture-user") {
        assert.equal(input.expectedRevision, record.revision);
        const { expectedRevision, professor, ...changes } = input;
        record = { ...record, ...changes, professor: professor ? { ...record.professor, ...professor } : record.professor, revision: expectedRevision + 1 }; body = record;
      } else if (method === "PUT" && path === "/api/users/fixture-user/roles") {
        assert.equal(input.expectedRevision, record.revision); record.roleIds = input.roleIds; record.revision++;
        body = { userId: record.id, roleIds: record.roleIds, permissions: [], revision: record.revision };
      } else if (method === "DELETE" && path === "/api/users/fixture-user") { status = 204; body = undefined; }
      else throw new Error("Unexpected fixture write.");
    }
    await send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(body === undefined ? "" : JSON.stringify(body)).toString("base64") });
  } catch (error) { fixtureFailure = error; await send("Fetch.failRequest", { requestId: event.requestId, errorReason: "Failed" }); }
});
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  for (const [name, cookieValue] of jar) await send("Network.setCookie", { name, value: cookieValue, url: base, httpOnly: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1480, height: 1160, deviceScaleFactor: 1, mobile: false });
  await send("Fetch.enable", { patterns: ["users", "roles", "departments", "hiring-levels"].map(path => ({ urlPattern: `${base}/api/${path}*` })) });

  await navigate("/admin/users/new");
  await wait(`document.querySelector('[name="accountStatus"]')?.options.length === 2`);
  assert.equal(await evaluate(`document.querySelector('h1').textContent`), "Create User");
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(e => e.textContent === 'Delete User')`), false);
  await click("Save Changes"); await wait(`document.querySelectorAll('[aria-invalid="true"]').length >= 3`);
  await value("name", "Created Fixture"); await value("email", "created@example.test"); await value("roleIds", "r1");
  await value("roleIds", "r2"); await value("hiringLevelId", "h1"); await value("departmentId", "d1");
  await value("hiringLevelId", "");
  assert.equal(await evaluate(`!!document.querySelector('[name="departmentId"]')`), false);
  await value("hiringLevelId", "h1"); await value("departmentId", "d1");
  await value("accountStatus", "api-status");
  const geometry = await evaluate(`(() => {const a=document.querySelector('[name="name"]').getBoundingClientRect(), b=document.querySelector('[name="email"]').getBoundingClientRect(); return {width:a.width, gap:b.x-a.right, sameRow:a.y===b.y};})()`);
  assert.equal(geometry.width, 480); assert.equal(geometry.gap, 24); assert.equal(geometry.sameRow, true);
  await click("Save Changes");
  await evaluate(`document.querySelector('main form').requestSubmit(); document.querySelector('main form').requestSubmit()`);
  await wait(`document.querySelector('main').textContent.includes('User created.')`);
  assert.equal(requests.filter(r => r.method === "POST").length, 1);
  assert.deepEqual(record.roleIds, ["r2", "r1"]);

  record = structuredClone(initial); requests = []; mode = "roles-fail";
  await navigate("/admin/users/fixture-user"); await wait(`document.querySelector('[name="name"]')?.value === 'Fixture Person'`);
  await value("name", "Edited Fixture"); await value("roleIds", "r3");
  await click("Save Changes"); await wait(`document.querySelector('main').textContent.includes('Account details were saved.')`);
  assert.deepEqual(requests.map(r => r.method), ["PATCH", "PUT"]);
  assert.equal(await evaluate(`document.querySelector('[name="name"]').value`), "Edited Fixture");
  await click("Save Changes"); await wait(`document.querySelector('main').textContent.includes('Changes saved.')`);
  assert.deepEqual(requests.map(r => r.method), ["PATCH", "PUT", "PUT"]);
  assert.deepEqual(record.roleIds, ["r3", "r1", "r2"]);

  mode = "conflict"; await value("name", "Conflict edit"); await click("Save Changes");
  await wait(`document.querySelector('main').textContent.includes('Saving and deletion are paused')`);
  await click("Reload latest record"); await wait(`document.querySelector('main').textContent.includes('Latest record loaded')`);
  assert.equal(await evaluate(`document.querySelector('[name="name"]').value`), "Conflict edit");
  assert.equal(await evaluate(`document.querySelector('[name="email"]').value`), "concurrent@example.test");
  await click("Save Changes"); await wait(`document.querySelector('main').textContent.includes('Changes saved.')`);
  await value("email", "invalid"); await click("Save Changes"); await wait(`document.querySelector('[name="email"]').getAttribute('aria-invalid') === 'true'`);
  await value("email", "valid@example.test");
  await send("Page.captureScreenshot", { format: "png" }).then(result => writeFileSync(join(tmpdir(), "assessment-user-form-desktop.png"), Buffer.from(result.data, "base64")));
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
  assert.equal(await evaluate(`document.querySelector('[name="name"]').getBoundingClientRect().y < document.querySelector('[name="email"]').getBoundingClientRect().y`), true);
  await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }).then(result => writeFileSync(join(tmpdir(), "assessment-user-form-mobile.png"), Buffer.from(result.data, "base64")));
  await click("Delete User"); await wait(`document.querySelector('dialog')?.open`);
  assert.equal(await evaluate(`document.activeElement.textContent`), "Cancel");
  await evaluate(`document.querySelector('dialog button').click()`); await wait(`!document.querySelector('dialog')`);
  await click("Delete User"); await evaluate(`document.querySelector('dialog button:last-child').click()`);
  await wait(`location.pathname === '/admin/users'`); assert.equal(requests.at(-1).method, "DELETE");

  mode = "unavailable"; await navigate("/admin/users/new");
  await wait(`document.querySelector('main').textContent.includes('No valid account statuses')`);
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(e => e.textContent === 'Save Changes').disabled`), true);
  await navigate("/admin/users/fixture-user"); await wait(`document.querySelector('main').textContent.includes('record or API endpoint is unavailable')`);
  mode = "malformed"; await click("Retry loading user"); await wait(`document.querySelector('main').textContent.includes('no usable revision')`);
  if (fixtureFailure) throw fixtureFailure;
  console.log("Passed Create/Edit browser fixtures: guards, populated layouts, validation, complete roles, duplicate-submit prevention, partial save/retry, conflict reload, delete/cancel, unavailable APIs, missing revision and mobile overflow. Screenshots saved to the OS temp directory.");
} finally {
  await send("Fetch.disable"); socket.close(); await fetch(`${debug}/json/close/${target.id}`);
}
