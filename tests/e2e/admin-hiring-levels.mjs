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
const anonymous = await fetch(`${base}/admin/hiring-levels`, { redirect: "manual" });
assert.equal(anonymous.status, 307); assert.equal(new URL(anonymous.headers.get("location"), base).pathname, "/login");
for (const role of ["Faculty", "AC"]) {
  const { request } = await login(role); const response = await request("/admin/hiring-levels");
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
  await send("Page.navigate", { url: `${base}/admin/hiring-levels` });
  await wait(`location.pathname === '/admin/hiring-levels' && document.readyState === 'complete'`);
}
async function click(label) {
  assert.ok(await evaluate(`(() => { const e = [...document.querySelectorAll('[aria-label]')].find(e => e.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!e || e.disabled) return false; e.click(); return true; })()`), "Expected an enabled labelled control.");
}
async function button(text) {
  assert.ok(await evaluate(`(() => {const e=[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)});if(!e||e.disabled)return false;e.click();return true;})()`));
}
async function value(name, next) {
  const selector = JSON.stringify('dialog [name="' + name + '"]');
  await evaluate("(() => { const e = document.querySelector(" + selector + "); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(e," + JSON.stringify(next) + "); e.dispatchEvent(new Event('input', {bubbles:true})); })()");
}
let items = [
  { id: "assistant-fixture", name: "Assistant Professor", evaluationIntervalYears: 1, active: true, revision: 0 },
  { id: "associate-fixture", name: "Associate Professor", evaluationIntervalYears: 2, active: true, revision: 1 },
  { id: "full-fixture", name: "Full Professor", evaluationIntervalYears: 2, active: true, revision: 2 },
];
let mode = "normal", paginated = true, requests = [], fixtureFailure;
handlers.set("Fetch.requestPaused", async event => {
  try {
    const url = new URL(event.request.url), method = event.request.method;
    let status = 200, body, contentType = "application/json";
    if (mode === "network") { await send("Fetch.failRequest", { requestId: event.requestId, errorReason: "Failed" }); return; }
    if (method === "GET" && url.pathname === "/api/hiring-levels") {
      if (mode === "unavailable" || mode === "read401" || mode === "read403") {
        status = mode === "unavailable" ? 404 : mode === "read401" ? 401 : 403; body = { error: { code: "UNAVAILABLE" } };
      } else if (mode === "html") { contentType = "text/html"; body = "<html>Unavailable</html>"; }
      else if (mode === "malformed") body = { items: [{ ...items[0], revision: undefined }] };
      else if (mode === "empty") body = { items: [] };
      else if (paginated) {
        const next = url.searchParams.get("cursor");
        body = { items: next ? items.slice(2) : items.slice(0, 2), pageInfo: { hasMore: !next, nextCursor: next ? null : "next-page" } };
      } else body = { items };
    } else {
      const input = event.request.postData ? JSON.parse(event.request.postData) : undefined;
      const target = items.find(item => url.pathname === "/api/hiring-levels/" + item.id);
      requests.push({ method, path: url.pathname, input }); await pause(180);
      if (mode === "write401" || mode === "write403") { status = mode === "write401" ? 401 : 403; body = { error: { code: "DENIED" } }; }
      else if (mode === "validation") { status = 422; body = { error: { code: "INVALID", fieldErrors: { name: ["Fixture name rejected"] } } }; mode = "normal"; }
      else if (method === "POST" && url.pathname === "/api/hiring-levels") {
        assert.deepEqual(Object.keys(input).sort(), ["evaluationIntervalYears", "name"]);
        const created = { ...input, id: "created-fixture", active: false, revision: "created-revision" };
        items.push(created); status = 201; body = created;
        if (mode === "create-uncertain") { contentType = "text/html"; body = "<html>Saved but response lost</html>"; mode = "normal"; }
      } else if (method === "PATCH" && target) {
        assert.equal(input.expectedRevision, target.revision);
        if (mode === "conflict") {
          target.revision++; target.active = false; status = 409; body = { error: { code: "CONFLICT" } }; mode = "normal";
        } else {
          const { expectedRevision, ...changes } = input;
          Object.assign(target, changes, { revision: String(expectedRevision) + "-next" }); body = target;
        }
      } else if (method === "DELETE" && target) {
        assert.equal(input, undefined);
        if (mode === "in-use") { status = 409; body = { error: { code: "REFERENCED" } }; }
        else {
          items = items.filter(item => item.id !== target.id); status = 204;
          if (mode === "delete-uncertain") { status = 200; contentType = "text/html"; body = "<html>Unknown result</html>"; mode = "normal"; }
        }
      } else throw new Error("Unexpected business API request; blocked.");
    }
    await send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: status,
      responseHeaders: [{ name: "Content-Type", value: contentType }],
      body: Buffer.from(status === 204 ? "" : contentType === "text/html" ? body : JSON.stringify(body)).toString("base64") });
  } catch (error) {
    if (error.message.includes("Invalid InterceptionId")) return;
    fixtureFailure = error;
    await send("Fetch.failRequest", { requestId: event.requestId, errorReason: "Failed" }).catch(failure => {
      if (!failure.message.includes("Invalid InterceptionId")) throw failure;
    });
  }
});
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  for (const [name, cookieValue] of jar) await send("Network.setCookie", { name, value: cookieValue, url: base, httpOnly: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1480, height: 1160, deviceScaleFactor: 1, mobile: false });
  await send("Fetch.enable", { patterns: [{ urlPattern: base + "/api/hiring-levels*" }] });
  await navigate(); await wait("document.querySelectorAll('tbody tr').length === 3");
  assert.equal(await evaluate("document.querySelector('h1').textContent"), "Hiring Levels & Frequency");
  assert.equal(await evaluate("document.querySelector('[aria-current=\"page\"]').getAttribute('href')"), "/admin/hiring-levels");
  assert.equal(await evaluate("document.querySelector('thead th').getBoundingClientRect().height"), 80);
  assert.equal(await evaluate("document.querySelector('table').getBoundingClientRect().y"), 229);
  assert.equal(await evaluate("document.querySelector('tbody').textContent.includes('Every 1 calendar year')"), true);
  await send("Page.captureScreenshot", { format: "png" }).then(r => writeFileSync(join(tmpdir(), "assessment-hiring-levels-desktop.png"), Buffer.from(r.data, "base64")));
  paginated = false;
  await button("Add Hiring Level"); await wait("document.querySelector('dialog')?.open");
  assert.equal(await evaluate("document.activeElement.name"), "name");
  assert.equal(await evaluate("!!document.querySelector('dialog [name=\"active\"]')"), false);
  await value("evaluationIntervalYears", "0"); await button("Save");
  await wait("document.querySelectorAll('dialog [aria-invalid=\"true\"]').length === 2");
  await value("name", "Fixture New Level"); await value("evaluationIntervalYears", "3");
  await button("Save");
  await evaluate("document.querySelector('dialog form').requestSubmit(); document.querySelector('dialog form').requestSubmit()");
  await wait("!document.querySelector('dialog') && document.querySelectorAll('tbody tr').length === 4");
  assert.equal(requests.filter(r => r.method === "POST").length, 1);
  assert.equal(await evaluate("document.querySelector('tbody tr:last-child').textContent.includes('Inactive')"), true);
  mode = "validation"; await click("Edit Fixture New Level"); await wait("document.querySelector('dialog')?.open");
  await value("name", "Keep this input"); await button("Save"); await wait("document.querySelector('dialog').textContent.includes('Fixture name rejected')");
  assert.equal(await evaluate("document.querySelector('dialog [name=\"name\"]').value"), "Keep this input");
  assert.equal(await evaluate("document.activeElement.name"), "name");
  await value("name", "Validated Level"); await button("Save"); await wait("!document.querySelector('dialog')");
  mode = "conflict"; await click("Edit Associate Professor"); await wait("document.querySelector('dialog')?.open");
  await value("name", "Associate Updated"); await button("Save");
  await wait("document.querySelector('dialog').textContent.includes('Reload this hiring level before trying again')");
  await button("Reload latest hiring level"); await wait("document.querySelector('dialog').textContent.includes('Latest hiring level loaded')");
  assert.equal(await evaluate("document.querySelector('dialog [name=\"name\"]').value"), "Associate Updated");
  assert.equal(await evaluate("document.querySelector('dialog [name=\"active\"]').checked"), false);
  await button("Save"); await wait("!document.querySelector('dialog')");
  assert.deepEqual(Object.keys(requests.at(-1).input).sort(), ["expectedRevision", "name"]);
  await click("Edit Associate Updated"); await wait("document.querySelector('dialog')?.open");
  await evaluate("document.querySelector('dialog [name=\"active\"]').click()"); await button("Save"); await wait("!document.querySelector('dialog')");
  assert.equal(requests.at(-1).input.active, true);
  mode = "in-use"; await click("Remove Full Professor"); await wait("document.querySelector('dialog')?.open");
  assert.equal(await evaluate("document.activeElement.textContent"), "Cancel");
  assert.ok(await evaluate("document.querySelector('dialog').getAttribute('aria-describedby')"));
  const beforeCancel = requests.length;
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await wait("!document.querySelector('dialog')"); assert.equal(requests.length, beforeCancel);
  await click("Remove Full Professor"); await wait("document.querySelector('dialog')?.open"); await button("Remove Hiring Level");
  await wait("document.querySelector('dialog').textContent.includes('may be in use')");
  assert.ok(items.find(item => item.id === "full-fixture").active); assert.equal(requests.at(-1).method, "DELETE");
  await button("Cancel");
  mode = "delete-uncertain"; await click("Remove Validated Level"); await wait("document.querySelector('dialog')?.open"); await button("Remove Hiring Level");
  await wait("document.querySelector('dialog').textContent.includes('operation may have completed')");
  await button("Reload latest hiring level"); await wait("document.querySelector('dialog').textContent.includes('no deletion response was confirmed')");
  await button("Cancel"); assert.equal(await evaluate("document.querySelector('main').textContent.includes('Hiring level removed.')"), false);
  await click("Remove Assistant Professor"); await wait("document.querySelector('dialog')?.open"); await button("Remove Hiring Level");
  await wait("!document.querySelector('dialog') && document.querySelector('main').textContent.includes('Hiring level removed.')");
  assert.equal(await evaluate("document.activeElement.textContent"), "Add Hiring Level");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Hiring levels table\"]').scrollWidth > document.querySelector('[aria-label=\"Hiring levels table\"]').clientWidth"), true);
  await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }).then(r => writeFileSync(join(tmpdir(), "assessment-hiring-levels-mobile.png"), Buffer.from(r.data, "base64")));
  await button("Add Hiring Level"); await wait("document.querySelector('dialog')?.open");
  assert.equal(await evaluate("document.querySelector('dialog').getBoundingClientRect().right <= innerWidth"), true);
  await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }).then(r => writeFileSync(join(tmpdir(), "assessment-hiring-levels-dialog-mobile.png"), Buffer.from(r.data, "base64")));
  await button("Cancel");
  for (const scenario of ["write401", "write403"]) {
    mode = "normal"; await navigate(); await wait("document.querySelectorAll('tbody tr').length === 2");
    mode = scenario; await click("Edit Associate Updated"); await wait("document.querySelector('dialog')?.open");
    await value("name", "Preserved denied edit"); await button("Save");
    await wait("document.querySelector('main').textContent.includes('Further changes are disabled')");
    assert.equal(await evaluate("document.querySelector('dialog [name=\"name\"]').value"), "Preserved denied edit");
  }
  mode = "normal"; await navigate(); await wait("document.querySelectorAll('tbody tr').length === 2");
  mode = "create-uncertain"; await button("Add Hiring Level"); await wait("document.querySelector('dialog')?.open");
  await value("name", "Unconfirmed new level"); await value("evaluationIntervalYears", "4"); await button("Save");
  await wait("document.querySelector('dialog').textContent.includes('Do not repeat this add request')"); await button("Cancel");
  assert.equal(await evaluate("document.querySelector('[data-add-hiring-level]').disabled"), true);
  for (const [scenario, message] of [["unavailable", "record or API endpoint is unavailable"], ["read401", "session has expired"], ["read403", "do not have permission"],
    ["network", "Unable to connect"], ["html", "API is unavailable"], ["malformed", "invalid hiring-level data"], ["empty", "No hiring levels are available"]]) {
    mode = scenario; await navigate(); await wait("document.querySelector('main').textContent.includes(" + JSON.stringify(message) + ")");
  }
  if (fixtureFailure) throw fixtureFailure;
  console.log("Passed Hiring Levels browser fixtures: authorization, populated paginated list, Add/Edit/status/Remove, validation recovery, duplicate prevention, revision conflicts, in-use and uncertain deletion, uncertain creation, 401/403, missing/HTML/network/malformed/empty responses, focus/Escape and mobile layouts.");
} finally {
  await send("Fetch.disable"); socket.close(); await fetch(debug + "/json/close/" + target.id);
}
