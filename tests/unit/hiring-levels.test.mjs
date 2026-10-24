import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url); const cache = new Map();
function load(filename) {
  const path = resolve(root, filename);
  if (cache.has(path)) return cache.get(path);
  const loaded = { exports: {} };
  const localRequire = name => name.startsWith(".") ? load(resolve(dirname(path), name) + ".ts") : require(name);
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  new Function("require", "module", "exports", outputText)(localRequire, loaded, loaded.exports); cache.set(path, loaded.exports); return loaded.exports;
}
const api = load("src/components/admin/hiring-levels-api.ts");
const { AdminApiError } = load("src/components/admin/admin-api.ts");
const { createHiringLevelsController, validateHiringLevel, rebaseHiringLevel } = load("src/components/admin/hiring-levels-state.ts");
const level = { id: "level/one", name: "Test Level", evaluationIntervalYears: 2, active: true, revision: "revision-A" };
const other = { ...level, id: "level-two", name: "Second Level", active: false, revision: 0 };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });
function fixture(overrides = {}) {
  let state; const calls = [];
  const controller = createHiringLevelsController(value => { state = value; }, {
    list: async () => structuredClone([level, other]),
    create: async body => { calls.push(["POST", body]); return { ...level, ...body, id: "new-level", active: false, revision: 0 }; },
    patch: async (id, body) => { calls.push(["PATCH", id, body]); return { ...level, ...body, id, revision: "saved" }; },
    remove: async id => { calls.push(["DELETE", id]); }, ...overrides,
  });
  return { controller, calls, get state() { return state; } };
}

test("Hiring-level reads accept items-only responses and follow optional documented cursor metadata", async () => {
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push(path); assert.equal(options.method, "GET"); assert.equal(options.credentials, "same-origin"); assert.equal(options.cache, "no-store");
    return json({ items: [level] });
  };
  assert.deepEqual(await api.getHiringLevels(), [level]);
  assert.equal(new URL(calls[0], "http://local.test").searchParams.get("limit"), "100");
  calls.length = 0;
  globalThis.fetch = async path => { calls.push(path); return json(calls.length === 1
    ? { items: [level], pageInfo: { hasMore: true, nextCursor: "opaque+cursor" } }
    : { items: [other], pageInfo: { hasMore: false, nextCursor: null } }); };
  assert.deepEqual(await api.getHiringLevels(), [level, other]);
  assert.equal(new URL(calls[1], "http://local.test").searchParams.get("cursor"), "opaque+cursor");
});

test("Invalid revisions, intervals, statuses, duplicate IDs and non-advancing cursors fail instead of showing empty success", async () => {
  for (const item of [{ ...level, revision: undefined }, { ...level, evaluationIntervalYears: 0 }, { ...level, evaluationIntervalYears: 1.5 }, { ...level, active: "active" }]) {
    globalThis.fetch = async () => json({ items: [item] }); await assert.rejects(api.getHiringLevels(), /invalid/);
  }
  globalThis.fetch = async () => json({ items: [level, level] }); await assert.rejects(api.getHiringLevels(), /invalid/);
  let count = 0;
  globalThis.fetch = async () => json({ items: [{ ...level, id: `item-${count++}` }], pageInfo: { hasMore: true, nextCursor: "same" } });
  await assert.rejects(api.getHiringLevels(), /invalid/);
  globalThis.fetch = async () => json({ items: [], pageInfo: { hasMore: true, nextCursor: null } }); await assert.rejects(api.getHiringLevels(), /invalid/);
});

test("POST/PATCH use exact fields and opaque IDs; DELETE requires 204 and does not invent a revision payload", async () => {
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push({ path, method: options.method, body: options.body && JSON.parse(options.body) });
    return options.method === "DELETE" ? new Response(null, { status: 204 }) : json(level, options.method === "POST" ? 201 : 200);
  };
  await api.createHiringLevel({ name: "Test Level", evaluationIntervalYears: 2 });
  await api.patchHiringLevel(level.id, { expectedRevision: 0, active: false }); await api.removeHiringLevel(level.id);
  assert.deepEqual(calls, [
    { path: "/api/hiring-levels", method: "POST", body: { name: "Test Level", evaluationIntervalYears: 2 } },
    { path: "/api/hiring-levels/level%2Fone", method: "PATCH", body: { expectedRevision: 0, active: false } },
    { path: "/api/hiring-levels/level%2Fone", method: "DELETE", body: undefined },
  ]);
  globalThis.fetch = async () => json({}); await assert.rejects(api.removeHiringLevel(level.id), error => error.uncertain);
  globalThis.fetch = async () => json({ ...level, id: "wrong" }); await assert.rejects(api.patchHiringLevel(level.id, { expectedRevision: 0 }), error => error.uncertain);
});

test("HTTP/HTML/network/malformed failures and in-use conflicts remain distinct", async () => {
  for (const status of [401, 403, 404, 409, 422, 500]) {
    globalThis.fetch = async () => json({ error: { fieldErrors: { name: ["Rejected name"] } } }, status);
    await assert.rejects(api.createHiringLevel({ name: "Test", evaluationIntervalYears: 1 }), error => error.status === status
      && error.uncertain === (status === 500) && error.fieldErrors.name === "Rejected name");
  }
  globalThis.fetch = async () => json({ error: {} }, 409); await assert.rejects(api.removeHiringLevel(level.id), /may be in use/);
  globalThis.fetch = async () => new Response("<html>Missing</html>", { headers: { "Content-Type": "text/html" } });
  await assert.rejects(api.getHiringLevels(), error => !error.uncertain);
  await assert.rejects(api.createHiringLevel({ name: "Test", evaluationIntervalYears: 1 }), error => error.uncertain);
  globalThis.fetch = async () => { throw new TypeError("offline"); }; await assert.rejects(api.getHiringLevels(), /Unable to connect/);
  globalThis.fetch = async () => json({ items: [] }); assert.deepEqual(await api.getHiringLevels(), []);
});

test("Validation accepts positive whole years without inventing rank rules or default values", () => {
  for (const interval of ["", "0", "-1", "1.5", "1e2", "9007199254740992"]) assert.ok(validateHiringLevel({ name: "Test", evaluationIntervalYears: interval, active: null }).evaluationIntervalYears);
  assert.ok(validateHiringLevel({ name: " ", evaluationIntervalYears: "2", active: null }).name);
  assert.deepEqual(validateHiringLevel({ name: "Custom Level", evaluationIntervalYears: "4", active: null }), {});
});

test("Conflict reload treats equivalent input as unchanged and preserves actual field edits", () => {
  const latest = { ...level, name: "Concurrent name", evaluationIntervalYears: 4, active: false, revision: 2 };
  assert.deepEqual(rebaseHiringLevel({ name: " Test Level ", evaluationIntervalYears: "02", active: true }, level, latest), {
    name: latest.name, evaluationIntervalYears: "4", active: false,
  });
  assert.deepEqual(rebaseHiringLevel({ name: "My edit", evaluationIntervalYears: "3", active: true }, level, latest), {
    name: "My edit", evaluationIntervalYears: "3", active: false,
  });
});

test("Add/Edit/Remove update only confirmed data; Add has no active default and status changes stay separate from deletion", async () => {
  const f = fixture(); await f.controller.load(); f.controller.open("add");
  assert.equal(f.state.editor.draft.active, null); assert.equal(f.state.editor.draft.evaluationIntervalYears, "");
  await f.controller.submit(); assert.equal(f.calls.length, 0); assert.ok(f.state.editor.fieldErrors.name);
  f.controller.change("name", " New Level "); f.controller.change("evaluationIntervalYears", "3"); await f.controller.submit();
  assert.deepEqual(f.calls[0], ["POST", { name: "New Level", evaluationIntervalYears: 3 }]);
  assert.equal(f.state.items[2].active, false); assert.equal(f.state.editor, null);
  f.controller.open("edit", level.id); await f.controller.submit(); assert.equal(f.calls.length, 1);
  f.controller.change("active", false); await f.controller.submit();
  assert.deepEqual(f.calls[1], ["PATCH", level.id, { expectedRevision: "revision-A", active: false }]);
  assert.equal(f.state.items.length, 3); assert.deepEqual(f.state.items[1], other);
  f.controller.open("remove", other.id); f.controller.close(); assert.equal(f.calls.length, 2);
  f.controller.open("remove", other.id); await f.controller.submit();
  assert.deepEqual(f.calls[2], ["DELETE", other.id]); assert.equal(f.state.items.length, 2);
});

test("Duplicate submits and stale read completions cannot overwrite current state", async () => {
  let finish; let writes = 0;
  const f = fixture({ patch: async () => { writes++; return new Promise(resolve => { finish = resolve; }); } });
  await f.controller.load(); f.controller.open("edit", level.id); f.controller.change("name", "Edited");
  const saving = f.controller.submit(); await f.controller.submit(); f.controller.close();
  assert.equal(writes, 1); assert.ok(f.state.editor);
  finish({ ...level, name: "Edited", revision: 2 }); await saving; assert.equal(f.state.items[0].name, "Edited");
  const reads = [];
  const stale = fixture({ list: signal => new Promise(resolve => reads.push({ signal, resolve })) });
  const first = stale.controller.load(), second = stale.controller.load();
  assert.equal(reads[0].signal.aborted, true);
  reads[1].resolve([other]); await second; reads[0].resolve([level]); await first;
  assert.deepEqual(stale.state.items, [other]);
});

test("Recoverable errors retain input; conflict reload merges edits with concurrent status and revision", async () => {
  let reads = 0; const calls = [];
  const f = fixture({ list: async () => ++reads === 1 ? [level, other] : [{ ...level, active: false, revision: 7 }, other],
    patch: async (id, body) => { calls.push(body); if (calls.length === 1) throw new AdminApiError("Conflict", 409); return { ...level, ...body, revision: 8 }; } });
  await f.controller.load(); f.controller.open("edit", level.id); f.controller.change("name", "Preserved edit");
  await f.controller.submit(); await f.controller.submit(); assert.equal(calls.length, 1);
  assert.equal(f.state.editor.draft.name, "Preserved edit"); await f.controller.reloadEditor();
  assert.equal(f.state.editor.draft.active, false); assert.equal(f.state.editor.draft.name, "Preserved edit");
  await f.controller.submit(); assert.deepEqual(calls[1], { expectedRevision: 7, name: "Preserved edit" });
  const validation = fixture({ create: async () => { throw new AdminApiError("Validation", 422, { name: "Duplicate" }); } });
  await validation.controller.load(); validation.controller.open("add"); validation.controller.change("name", "Keep"); validation.controller.change("evaluationIntervalYears", "2");
  await validation.controller.submit(); assert.equal(validation.state.editor.draft.name, "Keep"); assert.equal(validation.state.editor.blocked, false);
  assert.equal(validation.state.editor.fieldErrors.name, "Duplicate");
});

test("In-use and uncertain deletions never remove rows or fall back to deactivation; missing reload targets stay unconfirmed", async () => {
  for (const error of [new AdminApiError("In use", 409), new AdminApiError("Offline", 0, {}, true)]) {
    let reads = 0; let deletes = 0;
    const f = fixture({ list: async () => ++reads === 1 ? [level, other] : [other], remove: async () => { deletes++; throw error; } });
    await f.controller.load(); f.controller.open("remove", level.id); await f.controller.submit(); await f.controller.submit();
    assert.equal(deletes, 1); assert.equal(f.state.items.length, 2); assert.equal(f.state.items[0].active, true);
    assert.equal(f.state.notice, ""); await f.controller.reloadEditor();
    assert.equal(f.state.editor.blocked, true); assert.match(f.state.editor.error.message, /no deletion response was confirmed/);
  }
});

test("Uncertain creation cannot be repeated after cancel/reload; 401/403 disable all subsequent writes", async () => {
  for (const [status, uncertain] of [[500, true], [401, false], [403, false]]) {
    let calls = 0;
    const f = fixture({ create: async () => { calls++; throw new AdminApiError("Failed", status, {}, uncertain); } });
    await f.controller.load(); f.controller.open("add"); f.controller.change("name", "Keep"); f.controller.change("evaluationIntervalYears", "2");
    await f.controller.submit(); await f.controller.submit(); assert.equal(calls, 1);
    assert.equal(f.state.editor.draft.name, "Keep"); f.controller.close(); await f.controller.load(); f.controller.open("add");
    assert.equal(f.state.editor, null); assert.equal(f.state.authDenied, status !== 500);
  }
});
