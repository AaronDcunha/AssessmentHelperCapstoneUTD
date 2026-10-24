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
const api = load("src/components/admin/user-form-api.ts");
const model = load("src/components/admin/user-form-model.ts");
// Fixtures live only in tests. No production endpoint or successful response is mocked by the app.
const user = { id: "user/1", name: "Test User", email: "user@example.test", accountStatus: true,
  roleIds: ["role-1", "role-2"], professor: null, revision: "revision-A" };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const list = (items, nextCursor = null) => ({ items, pageInfo: { nextCursor, hasMore: nextCursor !== null } });
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("User reads require the requested ID and an API-provided revision, including revision zero", async () => {
  globalThis.fetch = async (path, options) => {
    assert.equal(path, "/api/users/user%2F1");
    assert.equal(options.method, "GET"); assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    return json(user);
  };
  assert.deepEqual(await api.getUser(user.id), user);
  for (const invalid of [{ ...user, revision: undefined }, { ...user, revision: null }, { ...user, id: "another-user" }]) {
    globalThis.fetch = async () => json(invalid);
    await assert.rejects(api.getUser(user.id), /incomplete/);
  }
  globalThis.fetch = async () => json({ ...user, revision: 0 });
  assert.equal((await api.getUser(user.id)).revision, 0);
});

test("Create sends the full role set, optional faculty profile and no invented revision/password", async () => {
  const draft = { ...model.draftFromUser(user), departmentId: "dept", hiringLevelId: "level", hireDate: "2025-01-15" };
  globalThis.fetch = async (path, options) => {
    assert.equal(path, "/api/users"); assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), {
      name: user.name, email: user.email, roleIds: user.roleIds, accountStatus: user.accountStatus,
      professor: { departmentId: "dept", hiringLevelId: "level", hireDate: "2025-01-15" },
    });
    return json(user, 201);
  };
  const result = await model.saveUserDraft(draft, null);
  assert.equal(result.error, null); assert.equal(result.current.id, user.id);
});

test("Combined edits PATCH first and assign the complete roles with the returned revision", async () => {
  const calls = [];
  globalThis.fetch = async (path, options) => {
    const body = JSON.parse(options.body); calls.push({ path, method: options.method, body });
    if (options.method === "PATCH") return json({ ...user, name: "Updated", revision: "revision-B" });
    return json({ userId: user.id, roleIds: ["role-1", "role-2", "role-3"], permissions: [], revision: "revision-C" });
  };
  const result = await model.saveUserDraft({ ...model.draftFromUser(user), name: "Updated", roleIds: [...user.roleIds, "role-3"] }, user);
  assert.deepEqual(calls, [
    { path: "/api/users/user%2F1", method: "PATCH", body: { expectedRevision: "revision-A", name: "Updated" } },
    { path: "/api/users/user%2F1/roles", method: "PUT", body: { roleIds: ["role-1", "role-2", "role-3"], expectedRevision: "revision-B" } },
  ]);
  assert.equal(result.current.revision, "revision-C"); assert.equal(result.error, null);
});

test("Partial success preserves the advanced revision and retry sends only the pending roles", async () => {
  const draft = { ...model.draftFromUser(user), name: "Updated", roleIds: ["role-1", "role-2", "role-3"] };
  const calls = [];
  globalThis.fetch = async (_, options) => {
    calls.push(options.method);
    return options.method === "PATCH" ? json({ ...user, name: draft.name, revision: 8 })
      : json({ error: { code: "VALIDATION", fieldErrors: { roleIds: ["Rejected assignment"] } } }, 422);
  };
  const partial = await model.saveUserDraft(draft, user);
  assert.equal(partial.detailsSaved, true); assert.equal(partial.current.revision, 8);
  assert.equal(partial.error.fieldErrors.roleIds, "Rejected assignment");
  globalThis.fetch = async (_, options) => {
    calls.push(options.method); assert.equal(JSON.parse(options.body).expectedRevision, 8);
    return json({ userId: user.id, roleIds: draft.roleIds, permissions: [], revision: 9 });
  };
  const retry = await model.saveUserDraft(draft, partial.current);
  assert.equal(retry.error, null); assert.deepEqual(calls, ["PATCH", "PUT", "PUT"]);
});

test("Failed detail save never attempts roles; unchanged edits issue no writes", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return json({ error: { code: "CONFLICT" } }, 409); };
  const result = await model.saveUserDraft({ ...model.draftFromUser(user), name: "Changed", roleIds: ["role-3"] }, user);
  assert.equal(result.error.status, 409); assert.equal(result.current.revision, user.revision);
  assert.equal(requests, 1);
  await model.saveUserDraft(model.draftFromUser(user), user);
  assert.equal(requests, 1);
});

test("Mutation failures distinguish explicit rejection from uncertain network/HTML/500/malformed success", async () => {
  for (const status of [401, 403, 404, 409, 422]) {
    globalThis.fetch = async () => json({ error: { code: "ERROR" } }, status);
    await assert.rejects(api.patchUser(user.id, {}), e => e.status === status && !e.uncertain);
  }
  for (const respond of [
    () => { throw new TypeError("offline"); },
    () => new Response("<html>Unavailable</html>", { headers: { "Content-Type": "text/html" } }),
    () => json({ error: {} }, 500), () => json({ id: user.id }),
  ]) {
    globalThis.fetch = async () => respond();
    await assert.rejects(api.createUser({}), e => e.uncertain === true);
  }
  globalThis.fetch = async () => json({ userId: user.id, roleIds: user.roleIds, permissions: [] });
  await assert.rejects(api.putUserRoles(user.id, user.roleIds, user.revision), e => e.uncertain);
});

test("Lookup shapes respect departments pagination and the hiring-level items-only response", async () => {
  const calls = [];
  globalThis.fetch = async path => {
    calls.push(path);
    if (path.startsWith("/api/departments")) return json(calls.length === 1 ? list([{ id: "d1", code: "D1", name: "Dept 1" }], "next") : list([{ id: "d2", code: "D2", name: "Dept 2" }]));
    if (path === "/api/hiring-levels") return json({ items: [{ id: "h", name: "Level", active: true }] });
    return json(list([{ ...user, roles: [{ id: "role-1", name: "Role 1" }] }]));
  };
  assert.equal((await api.getDepartments(new AbortController().signal)).length, 2);
  assert.match(calls[1], /cursor=next/);
  assert.equal((await api.getHiringLevels(new AbortController().signal)).length, 1);
});

test("Validation accepts only boolean status selections and available roles and validates only supplied faculty profiles", () => {
  const draft = model.draftFromUser(user);
  assert.deepEqual(model.validateUserDraft(draft, user, []), {});
  const errors = model.validateUserDraft({ ...draft, name: " ", email: "invalid", roleIds: [], accountStatus: "invented",
    hiringLevelId: "level", hireDate: "2026-02-30" }, null, []);
  for (const key of ["name", "email", "roleIds", "accountStatus", "professor.departmentId", "professor.hireDate"]) assert.ok(errors[key]);
  const faculty = { ...user, professor: { departmentId: "d", hiringLevelId: "h", hireDate: "2025-01-15" } };
  assert.ok(model.validateUserDraft({ ...model.draftFromUser(faculty), hireDate: "" }, faculty, [])["professor.hireDate"]);
});

test("Explicit reload preserves local changes and concurrent role additions without losing untouched updates", () => {
  const latest = { ...user, email: "new@example.test", roleIds: [...user.roleIds, "concurrent-role"], revision: "B" };
  const merged = model.rebaseDraft({ ...model.draftFromUser(user), name: "Local edit", roleIds: ["role-1", "local-role"] }, user, latest);
  assert.equal(merged.email, latest.email); assert.equal(merged.name, "Local edit");
  assert.deepEqual(merged.roleIds, ["role-1", "concurrent-role", "local-role"]);
});

test("Delete uses only the documented endpoint and requires a confirmed 204", async () => {
  globalThis.fetch = async (path, options) => {
    assert.equal(path, "/api/users/user%2F1"); assert.equal(options.method, "DELETE"); assert.equal(options.body, undefined);
    return new Response(null, { status: 204 });
  };
  await api.deleteUser(user.id);
  globalThis.fetch = async () => json({});
  await assert.rejects(api.deleteUser(user.id), e => e.uncertain);
});


test("Both status choices work without existing users; false remains a boolean on create and edit", async () => {
  for (const active of [true, false]) {
    const draft = { ...model.draftFromUser(user), accountStatus: String(active) };
    assert.deepEqual(model.validateUserDraft(draft, null, user.roleIds), {});
    globalThis.fetch = async (path, options) => {
      assert.equal(path, "/api/users");
      assert.equal(options.method, "POST");
      assert.equal(JSON.parse(options.body).accountStatus, active);
      return json({ ...user, accountStatus: active }, 201);
    };
    assert.equal((await model.saveUserDraft(draft, null)).current.accountStatus, active);
    const baseline = { ...user, accountStatus: !active };
    globalThis.fetch = async (path, options) => {
      assert.equal(options.method, "PATCH");
      assert.deepEqual(JSON.parse(options.body), { expectedRevision: user.revision, accountStatus: active });
      return json({ ...user, accountStatus: active, revision: "next" });
    };
    assert.equal((await model.saveUserDraft(draft, baseline)).current.accountStatus, active);
  }
  assert.ok(model.validateUserDraft({ ...model.draftFromUser(user), accountStatus: "" }, null, user.roleIds).accountStatus);
});

test("User detail requires an actual boolean status and retains inactive records", async () => {
  globalThis.fetch = async () => json({ ...user, accountStatus: false });
  assert.equal((await api.getUser(user.id)).accountStatus, false);
  for (const invalid of ["true", "false", "Active", null, 0]) {
    globalThis.fetch = async () => json({ ...user, accountStatus: invalid });
    await assert.rejects(api.getUser(user.id), /incomplete/);
  }
});
