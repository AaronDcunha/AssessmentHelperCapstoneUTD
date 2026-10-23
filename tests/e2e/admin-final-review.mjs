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
async function button(text) {
  assert.ok(await evaluate(`(() => {const e=[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)});if(!e||e.disabled)return false;e.click();return true;})()`));
}
// Isolated, read-only business fixtures for comparing all six routes to five frames.
const roles = [
  { id: "faculty-role", key: "faculty-fixture", name: "Faculty", permissionKeys: ["own"], revision: 1 },
  { id: "ac-role", key: "ac-fixture", name: "AC Member", permissionKeys: ["cycles"], revision: 1 },
  { id: "admin-role", key: "admin-fixture", name: "Administrator", permissionKeys: ["users", "roles", "hiring"], revision: 1 },
];
const permissions = [
  { key: "users", name: "Manage user accounts" }, { key: "roles", name: "Assign roles & permissions" },
  { key: "hiring", name: "Manage hiring levels" }, { key: "cycles", name: "Manage evaluation cycles" }, { key: "own", name: "View own evaluations" },
];
const levels = [
  { id: "assistant-fixture", name: "Assistant Professor", evaluationIntervalYears: 1, active: true, revision: 1 },
  { id: "associate-fixture", name: "Associate Professor", evaluationIntervalYears: 2, active: true, revision: 1 },
  { id: "full-fixture", name: "Full Professor", evaluationIntervalYears: 2, active: true, revision: 1 },
];
const users = [1, 2, 3].map((n) => ({ id: n === 1 ? "fixture-user" : "fixture-user-" + n,
  name: "Professor " + n, email: "professor" + n + "@university.test", accountStatus: "Active", roles: [roles[0]] }));
const paths = [
  ["/admin", "Admin Dashboard", "/admin"], ["/admin/users", "Users", "/admin/users"],
  ["/admin/users/new", "Create User", "/admin/users"], ["/admin/users/fixture-user", "Edit User", "/admin/users"],
  ["/admin/roles", "Roles & Permissions", "/admin/roles"], ["/admin/hiring-levels", "Hiring Levels & Frequency", "/admin/hiring-levels"],
];
let mode = "fixture", fixtureFailure, businessCalls = 0;
const errors = [];
handlers.set("Runtime.exceptionThrown", () => { errors.push("Unhandled browser exception"); });
handlers.set("Fetch.requestPaused", async event => {
  try {
    const url = new URL(event.request.url);
    if (event.request.method !== "GET") throw new Error("Unexpected business write; blocked.");
    businessCalls++;
    if (mode === "real") { await send("Fetch.continueRequest", { requestId: event.requestId }); return; }
    let data;
    if (url.pathname === "/api/roles") data = { items: [roles[2], roles[1], roles[0]], pageInfo: { nextCursor: null, hasMore: false } };
    else if (url.pathname === "/api/permissions") data = { items: permissions };
    else if (url.pathname === "/api/hiring-levels") data = { items: levels };
    else if (url.pathname === "/api/departments") data = { items: [{ id: "dept-fixture", code: "TEST", name: "Test Department" }], pageInfo: { nextCursor: null, hasMore: false } };
    else if (url.pathname === "/api/users") {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const filtered = users.filter(u => (u.name + " " + u.email).toLowerCase().includes(q));
      data = { items: filtered, pageInfo: { nextCursor: null, hasMore: false } };
    } else if (url.pathname === "/api/users/fixture-user") data = { ...users[0], roleIds: ["faculty-role"], professor: null, revision: 1 };
    else throw new Error("Unexpected fixture endpoint; blocked.");
    await send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(data)).toString("base64") });
  } catch (error) {
    if (error.message.includes("Invalid InterceptionId")) return;
    fixtureFailure = error;
    await send("Fetch.failRequest", { requestId: event.requestId, errorReason: "Failed" }).catch(failure => {
      if (!failure.message.includes("Invalid InterceptionId")) throw failure;
    });
  }
});
async function go(path) {
  await send("Page.navigate", { url: base + path });
  await wait("location.pathname === " + JSON.stringify(path) + " && document.readyState === 'complete'");
}
async function ready(path) {
  if (path === "/admin/users") await wait("document.querySelectorAll('tbody tr').length === 3");
  if (path === "/admin/users/new" || path === "/admin/users/fixture-user") await wait("document.querySelector('[name=\"accountStatus\"]')?.options.length === 2 && !document.querySelector('fieldset')?.disabled");
  if (path === "/admin/roles") await wait("document.querySelectorAll('tbody tr').length === 5");
  if (path === "/admin/hiring-levels") await wait("document.querySelectorAll('tbody tr').length === 3");
}
async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(join(tmpdir(), "assessment-final-" + name + ".png"), Buffer.from(result.data, "base64"));
}
try {
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  for (const [name, value] of jar) await send("Network.setCookie", { name, value, url: base, httpOnly: true });
  await send("Fetch.enable", { patterns: ["users", "roles", "permissions", "hiring-levels", "departments"].map(path => ({ urlPattern: base + "/api/" + path + "*" })) });
  const metrics = [];
  for (const [width, height, viewport] of [[1480, 1160, "desktop"], [390, 844, "mobile"]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 640 });
    for (const [path, title, active] of paths) {
      const before = businessCalls;
      await go(path); await ready(path);
      assert.equal(await evaluate("document.querySelector('h1').textContent"), title);
      assert.equal(await evaluate("document.querySelector('header p').textContent"), "Fall 2026");
      assert.equal(await evaluate("document.querySelectorAll('header [aria-label=\"Notifications unavailable\"]').length"), 1);
      assert.equal(await evaluate("document.querySelector('[aria-current=\"page\"]').getAttribute('href')"), active);
      assert.equal(await evaluate("document.querySelectorAll('[aria-current=\"page\"]').length"), 1);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
      assert.equal(await evaluate("getComputedStyle(document.querySelector('h1')).fontSize"), "36px");
      assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"), "rgb(250, 251, 252)");
      assert.equal(await evaluate("document.querySelector('header [aria-label=\"Notifications unavailable\"]').getBoundingClientRect().width"), 24);
      assert.ok(await evaluate("!!document.querySelector('header [aria-label^=\"Account options for\"]')"));
      if (["/admin/users", "/admin/roles", "/admin/hiring-levels"].includes(path)) {
        assert.equal(await evaluate("document.querySelector('thead tr').getBoundingClientRect().height"), 80);
        assert.equal(await evaluate("document.querySelector('tbody tr').getBoundingClientRect().height"), 80);
      }
      if (path === "/admin") assert.equal(businessCalls, before);
      if (path.includes("/users/")) {
        assert.equal(await evaluate("document.querySelector('[name=\"email\"]').getBoundingClientRect().width > 0"), true);
        if (viewport === "desktop") {
          assert.equal(await evaluate("document.querySelector('[name=\"name\"]').getBoundingClientRect().width"), 480);
          assert.equal(await evaluate("document.querySelector('[name=\"email\"]').getBoundingClientRect().x - document.querySelector('[name=\"name\"]').getBoundingClientRect().right"), 24);
        }
      }
      if (viewport === "mobile") {
        await button("Show navigation");
        assert.equal(await evaluate("document.querySelector('[aria-label=\"Main navigation\"]').getBoundingClientRect().width <= innerWidth"), true);
        await button("Hide navigation");
      }
      const geometry = await evaluate("(() => { const h=document.querySelector('header').getBoundingClientRect(), t=document.querySelector('table')?.getBoundingClientRect();return {headerHeight:h.height,tableTop:t?.y,headerFont:getComputedStyle(document.querySelector('h1')).fontFamily}; })()");
      metrics.push({ path, viewport, ...geometry });
      const label = path === "/admin" ? "dashboard" : path.replace("/admin/", "").replaceAll("/", "-");
      await screenshot(label + "-" + viewport);
    }
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1480, height: 1160, deviceScaleFactor: 1, mobile: false });
  await go("/admin");
  // Exercise actual Next links, including both form destinations, rather than URL-only navigation.
  for (const targetPath of ["/admin/users", "/admin/users/new", "/admin/users", "/admin/users/fixture-user", "/admin/roles", "/admin/hiring-levels", "/admin"]) {
    if (targetPath === "/admin/users" && await evaluate("!!document.querySelector('main form')")) await button("Cancel");
    else await evaluate("(() => { const e=[...document.querySelectorAll('a')].find(e=>e.getAttribute('href')===" + JSON.stringify(targetPath) + "); if(!e)throw new Error('Expected navigation link');e.click();})()");
    await wait("location.pathname === " + JSON.stringify(targetPath)); await ready(targetPath);
  }
  await go("/admin/users"); await ready("/admin/users");
  await evaluate("(() => {const e=document.querySelector('[name=\"q\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'professor2@university.test');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await wait("document.querySelectorAll('tbody tr').length === 1");
  assert.ok(await evaluate("document.querySelector('tbody').textContent.includes('Professor 2')"));
  await evaluate("document.querySelector('details').open=true");
  await screenshot("users-filters-desktop");

  // Confirm honest real endpoint failures (GET only) and existing retry controls.
  mode = "real";
  for (const path of ["/admin/users", "/admin/users/new", "/admin/users/fixture-user", "/admin/roles", "/admin/hiring-levels"]) {
    await go(path);
    await wait("document.querySelector('main [role=\"alert\"]')?.textContent.length > 0");
    assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"), 0);
    assert.ok(await evaluate("[...document.querySelectorAll('main button')].some(e=>e.textContent.includes('Retry'))"));
  }
  // Faculty settings are unchanged; the existing AC probe remains accessible to Admin.
  for (const [path, semester] of [["/dashboard", true], ["/dashboard/evaluation", false], ["/observations", false], ["/test/ac", false]]) {
    await go(path);
    assert.equal(await evaluate("document.querySelector('header')?.textContent.includes('Fall 2026')"), semester);
    assert.equal(await evaluate("!!document.querySelector('header [aria-label=\"Notifications unavailable\"]')"), path !== "/test/ac");
    assert.equal(await evaluate("document.querySelectorAll('[data-navigation-section=\"faculty\"] [data-navigation-item]').length"), 5);
    await screenshot(path.replaceAll("/", "-").slice(1) + "-regression");
  }
  if (fixtureFailure) throw fixtureFailure;
  assert.equal(errors.length, 0, "No unhandled browser exceptions");
  console.log("Passed final Admin review: all six routes on desktop/mobile, shared semester/bell, dimensions and typography, active navigation, real link transitions, user email search, honest real unavailable/Retry states, and Faculty/AC probe regression. Screenshots saved to OS temp.");
  console.log(JSON.stringify(metrics));
} finally {
  await send("Fetch.disable"); socket.close(); await fetch(debug + "/json/close/" + target.id);
}
