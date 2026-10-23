import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const cache = new Map();
function load(filename) {
  const path = resolve(root, filename);
  if (cache.has(path)) return cache.get(path);
  const loaded = { exports: {} };
  const localRequire = name => name.startsWith(".") ? load(resolve(dirname(path), name) + ".ts") : require(name);
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  new Function("require", "module", "exports", outputText)(localRequire, loaded, loaded.exports);
  cache.set(path, loaded.exports);
  return loaded.exports;
}
const api = load("src/components/admin/roles-api.ts");
const { AdminApiError } = load("src/components/admin/admin-api.ts");
const { createRolesController, samePermissionKeys } = load("src/components/admin/roles-state.ts");
const role = { id: "role/one", name: "Role One", permissionKeys: ["read", "retained-key"], revision: "revision-A" };
const second = { id: "role-two", name: "Role Two", permissionKeys: [], revision: 0 };
const catalog = [{ key: "read", name: "Read" }, { key: "write", name: "Write" }, { key: "new", name: "New" }];
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const page = (items, nextCursor = null) => ({ items, pageInfo: { nextCursor, hasMore: nextCursor !== null } });
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });
function fixture(overrides = {}) {
  let state;
  const calls = [];
  const controller = createRolesController(value => { state = value; }, {
    roles: async () => structuredClone([role, second]), permissions: async () => catalog,
    save: async (id, keys, revision) => { calls.push({ id, keys, revision }); return { roleId: id, permissionKeys: keys, effectivePermissionKeys: [...keys, "inherited"], revision: "next" }; },
    ...overrides,
  });
  return { controller, calls, get state() { return state; } };
}

test("Roles consume full paginated assignments/revisions and the items-only permission catalog", async () => {
  const calls = [];
  globalThis.fetch = async (path, options) => {
    assert.equal(options.method, "GET"); assert.equal(options.credentials, "same-origin"); assert.equal(options.cache, "no-store");
    calls.push(path);
    if (path === "/api/permissions") return json({ items: catalog });
    return json(calls.length === 1 ? page([role], "opaque+cursor") : page([second]));
  };
  assert.deepEqual(await api.getPermissionRoles(), [role, second]);
  assert.equal(new URL(calls[0], "http://local.test").searchParams.get("limit"), "100");
  assert.equal(new URL(calls[1], "http://local.test").searchParams.get("cursor"), "opaque+cursor");
  assert.deepEqual(await api.getPermissionCatalog(), catalog);
});

test("Malformed catalogs, missing revisions, duplicate IDs/keys and repeated cursors fail explicitly", async () => {
  for (const value of [page([{ ...role, revision: undefined }]), page([{ ...role, permissionKeys: null }]),
    page([{ ...role, permissionKeys: ["read", "read"] }]), page([role, role]), { items: [role] }]) {
    globalThis.fetch = async () => json(value);
    await assert.rejects(api.getPermissionRoles(), /invalid/);
  }
  let count = 0;
  globalThis.fetch = async () => json(page([{ ...role, id: `role-${count++}` }], "same"));
  await assert.rejects(api.getPermissionRoles(), /invalid/);
  globalThis.fetch = async () => json({ items: [catalog[0], catalog[0]] });
  await assert.rejects(api.getPermissionCatalog(), /invalid/);
});

test("Permission PUT sends exactly the complete keys and expectedRevision to the selected opaque role ID", async () => {
  globalThis.fetch = async (path, options) => {
    assert.equal(path, "/api/roles/role%2Fone/permissions"); assert.equal(options.method, "PUT");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), { permissionKeys: ["read", "retained-key", "write"], expectedRevision: "revision-A" });
    return json({ roleId: role.id, permissionKeys: ["read", "retained-key", "write"], effectivePermissionKeys: ["read", "write", "inherited"], revision: 0 });
  };
  assert.equal((await api.saveRolePermissions(role.id, [...role.permissionKeys, "write"], role.revision)).revision, 0);
});

test("Permission reads/writes distinguish rejection, unavailable HTML, uncertain responses and validation fields", async () => {
  for (const status of [401, 403, 404, 409, 422, 500]) {
    globalThis.fetch = async () => json({ error: { code: "REJECTED", fieldErrors: { permissionKeys: ["Invalid selection"] } } }, status);
    await assert.rejects(api.saveRolePermissions(role.id, [], 0), error => error.status === status
      && error.uncertain === (status === 500) && error.fieldErrors.permissionKeys === "Invalid selection");
  }
  globalThis.fetch = async () => new Response("<html>Unavailable</html>", { headers: { "Content-Type": "text/html" } });
  await assert.rejects(api.getPermissionCatalog(), error => !error.uncertain);
  await assert.rejects(api.saveRolePermissions(role.id, [], 0), error => error.uncertain);
  for (const data of [{ roleId: "wrong", permissionKeys: [], effectivePermissionKeys: [], revision: 1 },
    { roleId: role.id, permissionKeys: [], revision: 1 }]) {
    globalThis.fetch = async () => json(data);
    await assert.rejects(api.saveRolePermissions(role.id, [], 0), error => error.uncertain);
  }
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  await assert.rejects(api.getPermissionRoles(), error => !error.uncertain);
  await assert.rejects(api.saveRolePermissions(role.id, [], 0), error => error.uncertain);
});

test("Saving one role preserves unlisted grants and all other roles' pending assignments", async () => {
  const f = fixture(); await f.controller.load();
  await f.controller.save(role.id); assert.equal(f.calls.length, 0);
  f.controller.toggle(role.id, "write", true); f.controller.toggle(second.id, "new", true);
  f.controller.toggle(role.id, "fabricated", true);
  await f.controller.save(role.id);
  assert.deepEqual(f.calls, [{ id: role.id, keys: ["read", "retained-key", "write"], revision: role.revision }]);
  assert.deepEqual(f.state.drafts[second.id], ["new"]); assert.deepEqual(f.state.roles[1], second);
  assert.equal(f.state.roles[0].revision, "next");
  assert.deepEqual(f.state.feedback[role.id].effectiveKeys, ["read", "retained-key", "write", "inherited"]);
  assert.equal(f.state.drafts[role.id].includes("inherited"), false);
});

test("Cancel discards only its role; requests are serialized and duplicate saves suppressed", async () => {
  let finish;
  const calls = [];
  const f = fixture({ save: (id, keys, revision) => { calls.push({ id, keys, revision }); return new Promise(resolve => { finish = resolve; }); } });
  await f.controller.load(); f.controller.toggle(role.id, "write", true); f.controller.toggle(second.id, "new", true);
  f.controller.discard(role.id);
  assert.deepEqual(f.state.drafts[role.id], role.permissionKeys); assert.deepEqual(f.state.drafts[second.id], ["new"]);
  f.controller.toggle(role.id, "write", true);
  const saving = f.controller.save(role.id);
  await f.controller.save(role.id); await f.controller.save(second.id); f.controller.toggle(role.id, "read", false);
  assert.equal(calls.length, 1); assert.ok(f.state.drafts[role.id].includes("read"));
  finish({ roleId: role.id, permissionKeys: calls[0].keys, effectivePermissionKeys: [], revision: 1 }); await saving;
  assert.equal(f.state.busyId, null);
});

test("Validation failure preserves edits and previously successful roles without pretending a combined save was atomic", async () => {
  const f = fixture({ save: async (id, keys) => {
    if (id === second.id) throw new AdminApiError("Validation", 422, { permissionKeys: "Rejected" });
    return { roleId: id, permissionKeys: keys, effectivePermissionKeys: keys, revision: 2 };
  } });
  await f.controller.load(); f.controller.toggle(role.id, "write", true); f.controller.toggle(second.id, "new", true);
  await f.controller.save(role.id); await f.controller.save(second.id);
  assert.equal(f.state.roles[0].revision, 2); assert.equal(f.state.roles[1].revision, 0);
  assert.deepEqual(f.state.drafts[second.id], ["new"]);
  assert.equal(f.state.feedback[second.id].blocked, false);
  assert.equal(f.state.feedback[second.id].error.fieldErrors.permissionKeys, "Rejected");
});

test("Conflict reload keeps explicit edits, concurrent grants and other roles' drafts, then uses the new revision", async () => {
  let reads = 0; const writes = [];
  const f = fixture({ roles: async () => ++reads === 1 ? [role, second] : [{ ...role, permissionKeys: [...role.permissionKeys, "new"], revision: "latest" }, second],
    save: async (id, keys, revision) => {
      writes.push({ keys, revision });
      if (writes.length === 1) throw new AdminApiError("Conflict", 409);
      return { roleId: id, permissionKeys: keys, effectivePermissionKeys: keys, revision: "saved" };
    } });
  await f.controller.load(); f.controller.toggle(role.id, "read", false); f.controller.toggle(role.id, "write", true); f.controller.toggle(second.id, "write", true);
  await f.controller.save(role.id); await f.controller.save(role.id); assert.equal(writes.length, 1);
  await f.controller.reload(role.id);
  assert.deepEqual(f.state.drafts[role.id], ["retained-key", "new", "write"]);
  assert.deepEqual(f.state.drafts[second.id], ["write"]);
  await f.controller.save(role.id); assert.equal(writes[1].revision, "latest");
});

test("Uncertain writes require reload even after Cancel; lost access prevents saves to any role", async () => {
  for (const [status, uncertain] of [[0, true], [500, true], [401, false], [403, false]]) {
    let calls = 0;
    const f = fixture({ save: async () => { calls++; throw new AdminApiError("Failed", status, {}, uncertain); } });
    await f.controller.load(); f.controller.toggle(role.id, "write", true); await f.controller.save(role.id);
    assert.equal(f.state.feedback[role.id].blocked, true); assert.deepEqual(f.state.drafts[role.id], [...role.permissionKeys, "write"]);
    f.controller.discard(role.id); f.controller.toggle(role.id, "write", true); await f.controller.save(role.id);
    assert.equal(calls, 1);
    if (status === 401 || status === 403) { assert.equal(f.state.authDenied, true); await f.controller.save(second.id); assert.equal(calls, 1); }
  }
});

test("Removed roles stay blocked with recoverable edits; cancelled reads cannot publish stale data", async () => {
  let reads = 0;
  const f = fixture({ roles: async () => ++reads === 1 ? [role, second] : [second] });
  await f.controller.load(); f.controller.toggle(role.id, "write", true); await f.controller.reload(role.id);
  assert.equal(f.state.feedback[role.id].blocked, true); assert.ok(f.state.drafts[role.id].includes("write"));
  let finish;
  const cancelled = fixture({ roles: () => new Promise(resolve => { finish = resolve; }) });
  const loading = cancelled.controller.load(); cancelled.controller.cancel(); finish([role]); await loading;
  assert.equal(cancelled.state.status, "loading");
  assert.equal(samePermissionKeys(["read", "write"], ["write", "read"]), true);
});
