// Run against localhost development server and an isolated Chrome/Edge CDP port 9223.
// Seeded credentials/cookies stay private. Every business API request is intercepted
// in this test's browser target; no fixture mutation can reach the database.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const base = process.env.TEST_BASE_URL ?? "http://localhost:3000";
assert.equal(new URL(base).hostname, "localhost");
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
const anonymous = await fetch(`${base}/admin/roles`, { redirect: "manual" });
assert.equal(anonymous.status, 307); assert.equal(new URL(anonymous.headers.get("location"), base).pathname, "/login");
for (const role of ["Faculty", "AC"]) {
  const { request } = await login(role); const response = await request("/admin/roles");
  assert.equal(response.status, 307); assert.equal(new URL(response.headers.get("location"), base).pathname, "/forbidden");
}
const { jar } = await login("Admin");
const target = await (await fetch(`${debug}/json/new?about:blank`, { method: "PUT" })).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map(); const handlers = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const task = pending.get(message.id); pending.delete(message.id);
    if (message.error) task?.reject(new Error(`Browser protocol ${task?.method} failed: ${message.error.message}`)); else task?.resolve(message.result);
  } else handlers.get(message.method)?.(message.params);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject, method }); socket.send(JSON.stringify({ id: requestId, method, params })); });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!result.exceptionDetails, "Browser evaluation must succeed."); return result.result?.value;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(50); }
  throw new Error(`Browser condition timed out: ${expression}`);
}
async function navigate() {
  // Tests intentionally discard selections when switching isolated scenarios.
  handlers.set("Page.javascriptDialogOpening", () => { void send("Page.handleJavaScriptDialog", { accept: true }); });
  await send("Page.navigate", { url: `${base}/admin/roles` });
  await wait(`location.pathname === '/admin/roles' && document.readyState === 'complete'`);
}
async function click(label) {
  assert.ok(await evaluate(`(() => { const e = [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!e || e.disabled) return false; e.click(); return true; })()`), "Expected an enabled labelled control.");
}
async function button(text) {
  assert.ok(await evaluate(`(() => {const e=[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)});if(!e||e.disabled)return false;e.click();return true;})()`));
}
const catalog = [
  { key: "users", name: "Manage user accounts" }, { key: "roles", name: "Assign roles & permissions" },
  { key: "hiring", name: "Manage hiring levels" }, { key: "cycles", name: "Manage evaluation cycles" }, { key: "own", name: "View own evaluations" },
];
let roles = [
  { id: "fixture-admin", name: "Administrator", permissionKeys: ["users", "roles", "hiring"], revision: 1 },
  { id: "fixture-ac", name: "AC Member", permissionKeys: ["cycles"], revision: 2 },
  { id: "fixture-faculty", name: "Faculty", permissionKeys: ["own"], revision: 0 },
];
let mode = "normal", requests = [], fixtureFailure, reads = 0;
handlers.set("Fetch.requestPaused", async event => {
  try {
    const url = new URL(event.request.url), method = event.request.method;
    let status = 200, body, contentType = "application/json";
    if (mode === "unavailable") { status = 404; body = { error: { code: "UNAVAILABLE" } }; }
    else if (mode === "network") { await send("Fetch.failRequest", { requestId: event.requestId, errorReason: "Failed" }); return; }
    else if (url.pathname === "/api/permissions" && method === "GET") {
      if (mode === "html") { contentType = "text/html"; body = "<html>Missing API</html>"; }
      else body = { items: mode === "empty-permissions" ? [] : catalog };
    } else if (url.pathname === "/api/roles" && method === "GET") {
      reads++;
      const more = url.searchParams.get("cursor");
      body = mode === "empty-roles" ? { items: [], pageInfo: { nextCursor: null, hasMore: false } }
        : { items: more ? roles.slice(2) : roles.slice(0, 2), pageInfo: { nextCursor: more ? null : "next", hasMore: !more } };
      if (mode === "malformed") body.items = body.items.map(role => ({ ...role, revision: undefined }));
    } else if (method === "PUT" && /^\/api\/roles\/fixture-[^/]+\/permissions$/.test(url.pathname)) {
      const role = roles.find(role => url.pathname === `/api/roles/${role.id}/permissions`);
      const input = JSON.parse(event.request.postData); requests.push({ roleId: role.id, input });
      await pause(200);
      if (mode === "validation") { status = 422; body = { error: { code: "INVALID", fieldErrors: { permissionKeys: ["Fixture selection rejected"] } } }; mode = "normal"; }
      else if (mode === "conflict") { status = 409; body = { error: { code: "CONFLICT" } }; role.permissionKeys.push("concurrent-key"); role.revision++; mode = "normal"; }
      else if (mode === "unauthorized" || mode === "forbidden") { status = mode === "unauthorized" ? 401 : 403; body = { error: { code: "DENIED" } }; }
      else {
        assert.equal(input.expectedRevision, role.revision); role.permissionKeys = input.permissionKeys; role.revision++;
        body = { roleId: role.id, permissionKeys: role.permissionKeys, effectivePermissionKeys: [...new Set([...role.permissionKeys, "inherited-only"])], revision: role.revision };
        if (mode === "uncertain") { contentType = "text/html"; body = "<html>Response lost after save</html>"; mode = "normal"; }
      }
    } else throw new Error("Unexpected business API request; blocked.");
    await send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: "Content-Type", value: contentType }], body: Buffer.from(contentType === "text/html" ? body : JSON.stringify(body)).toString("base64") });
  } catch (error) {
    // Navigation/React cleanup can abort a paused read before CDP fulfills it.
    if (error.message.includes("Invalid InterceptionId")) return;
    fixtureFailure = error;
    await send("Fetch.failRequest", { requestId: event.requestId, errorReason: "Failed" }).catch(failure => {
      if (!failure.message.includes("Invalid InterceptionId")) throw failure;
    });
  }
});
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  for (const [name, value] of jar) await send("Network.setCookie", { name, value, url: base, httpOnly: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1480, height: 1160, deviceScaleFactor: 1, mobile: false });
  await send("Fetch.enable", { patterns: ["roles", "permissions"].map(path => ({ urlPattern: `${base}/api/${path}*` })) });
  await navigate(); await wait(`document.querySelectorAll('input[type="checkbox"]').length === 15`);
  assert.ok(reads >= 2); assert.equal(await evaluate(`document.querySelector('h1').textContent`), "Roles & Permissions");
  assert.equal(await evaluate(`document.querySelector('[aria-current="page"]').getAttribute('href')`), "/admin/roles");
  assert.equal(await evaluate(`document.querySelector('thead th').getBoundingClientRect().height`), 80);
  assert.equal(await evaluate(`document.querySelector('table').getBoundingClientRect().y`), 161);
  await send("Page.captureScreenshot", { format: "png" }).then(r => writeFileSync(join(tmpdir(), "assessment-roles-desktop.png"), Buffer.from(r.data, "base64")));
  await evaluate(`document.querySelector('[aria-label="Administrator: Manage evaluation cycles"]').focus()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await wait(`document.querySelector('[aria-label="Administrator: Manage evaluation cycles"]').checked`);
  await click("AC Member: Manage user accounts");
  await click("Save permissions for Administrator");
  await evaluate(`document.querySelector('[aria-label="Save permissions for Administrator"]').click()`);
  await wait(`document.querySelector('main').textContent.includes('Permissions saved.')`);
  assert.equal(requests.length, 1); assert.equal(requests[0].roleId, "fixture-admin");
  assert.deepEqual(requests[0].input.permissionKeys, ["users", "roles", "hiring", "cycles"]);
  assert.equal(await evaluate(`document.querySelector('[aria-label="AC Member: Manage user accounts"]').checked`), true);
  await click("Cancel changes for AC Member");
  assert.equal(await evaluate(`document.querySelector('[aria-label="AC Member: Manage user accounts"]').checked`), false);
  mode = "validation"; await click("AC Member: Manage user accounts"); await click("Save permissions for AC Member");
  await wait(`document.querySelector('main').textContent.includes('Fixture selection rejected')`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="AC Member: Manage user accounts"]').checked`), true);
  await click("Save permissions for AC Member"); await wait(`document.querySelector('main').textContent.includes('No unsaved changes.')`);
  mode = "conflict"; await click("Administrator: Manage user accounts"); await click("Save permissions for Administrator");
  await wait(`document.querySelector('main').textContent.includes('Reload this role before saving again')`);
  await button("Reload Administrator"); await wait(`document.querySelector('main').textContent.includes('Latest assignments loaded')`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Administrator: Manage user accounts"]').checked`), false);
  await click("Save permissions for Administrator"); await wait(`document.querySelector('main').textContent.includes('No unsaved changes.')`);
  assert.ok(requests.at(-1).input.permissionKeys.includes("concurrent-key"));
  mode = "uncertain"; await click("Faculty: Manage hiring levels"); await click("Save permissions for Faculty");
  await wait(`document.querySelector('main').textContent.includes('operation may have completed')`);
  await button("Reload Faculty"); await wait(`document.querySelector('main').textContent.includes('No unsaved changes.')`);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Role permission matrix"]').scrollWidth > document.querySelector('[aria-label="Role permission matrix"]').clientWidth`), true);
  await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }).then(r => writeFileSync(join(tmpdir(), "assessment-roles-mobile.png"), Buffer.from(r.data, "base64")));
  for (const scenario of ["unauthorized", "forbidden"]) {
    mode = "normal"; await navigate(); await wait(`document.querySelectorAll('input[type="checkbox"]').length > 0`);
    mode = scenario; await click("AC Member: Manage hiring levels"); await click("Save permissions for AC Member");
    await wait(`document.querySelector('main').textContent.includes('Further saves are disabled')`);
    assert.equal(await evaluate(`[...document.querySelectorAll('button[aria-label^="Save permissions"]')].every(e=>e.disabled)`), true);
  }
  for (const [scenario, message] of [["unavailable", "record or API endpoint is unavailable"], ["network", "Unable to connect"],
    ["html", "API is unavailable"], ["malformed", "invalid permission catalog"], ["empty-roles", "No roles are available"],
    ["empty-permissions", "No editable permission definitions"]]) {
    mode = scenario; await navigate(); await wait(`document.querySelector('main').textContent.includes(${JSON.stringify(message)})`);
  }
  if (fixtureFailure) throw fixtureFailure;
  console.log("Passed Roles browser fixtures: authorization, populated paginated matrix, keyboard editing, scoped saves/cancel, duplicate prevention, validation recovery, conflict/uncertain reload, 401/403, unavailable/HTML/network/malformed/empty responses and mobile overflow.");
} finally {
  await send("Fetch.disable"); socket.close(); await fetch(`${debug}/json/close/${target.id}`);
}
