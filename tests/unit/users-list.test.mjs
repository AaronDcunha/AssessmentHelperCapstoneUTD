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
const { fetchUsers, fetchUserRoles, UsersApiError } = load("src/components/admin/users-api.ts");
const { createUsersListLoader, userFiltersKey } = load("src/components/admin/users-list-state.ts");
const filters = { q: "", roleId: "", accountStatus: "" };
const role = { id: "faculty-id", name: "Faculty" };
const user = { id: "user-id", name: "Test Faculty", email: "test@example.test", accountStatus: "active", roles: [role] };
const page = (items = [user], nextCursor = null) => ({ items, pageInfo: { nextCursor, hasMore: nextCursor !== null } });
const json = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test("Users requests encode the documented filters/cursor and keep private reads uncached", async () => {
  globalThis.fetch = async (url, options) => {
    const query = new URL(url, "http://local.test");
    assert.equal(query.pathname, "/api/users");
    assert.deepEqual(Object.fromEntries(query.searchParams), { limit: "20", q: "A & B", roleId: "role/2", accountStatus: "active", cursor: "opaque+cursor" });
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers.Accept, "application/json");
    return json(page());
  };
  assert.deepEqual(await fetchUsers({ q: " A & B ", roleId: "role/2", accountStatus: " active " }, "opaque+cursor", new AbortController().signal), page());
});

test("Successful empty pages stay distinct from HTTP, HTML, network and malformed failures", async () => {
  const cases = [
    [() => new Response("", { status: 401 }), "unauthorized"],
    [() => new Response("", { status: 403 }), "forbidden"],
    [() => new Response("<html>Missing</html>", { status: 404 }), "unavailable"],
    [() => new Response("<html>Login</html>", { headers: { "Content-Type": "text/html" } }), "unavailable"],
    [() => new Response("", { status: 500 }), "server"],
    [() => new Response("{", { headers: { "Content-Type": "application/json" } }), "malformed"],
    [() => json({ items: [], pageInfo: { hasMore: true, nextCursor: null } }), "malformed"],
    [() => json(page([{ ...user, roles: [{ name: "Missing ID" }] }])), "malformed"],
    [() => json(page([{ ...user, accountStatus: null }])), "malformed"],
    [() => { throw new TypeError("offline"); }, "network"],
  ];
  for (const [respond, kind] of cases) {
    globalThis.fetch = async () => respond();
    await assert.rejects(fetchUsers(filters, null, new AbortController().signal), error => error instanceof UsersApiError && error.kind === kind);
  }
  globalThis.fetch = async () => json(page([]));
  assert.deepEqual(await fetchUsers(filters, null, new AbortController().signal), page([]));
});

test("Role options follow catalog pagination and reject non-advancing cursors", async () => {
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    return json(requests.length === 1 ? page([role], "next-role") : page([{ id: "admin-id", name: "Admin" }]));
  };
  assert.equal((await fetchUserRoles(new AbortController().signal)).length, 2);
  assert.equal(new URL(requests[1], "http://local.test").searchParams.get("cursor"), "next-role");
  globalThis.fetch = async () => json(page([role], "repeated"));
  await assert.rejects(fetchUserRoles(new AbortController().signal), error => error.kind === "malformed");
});

test("New filters abort older requests and late responses cannot replace current results", async () => {
  let state;
  const requests = [];
  const loader = createUsersListLoader(value => { state = value; }, (filters, cursor, signal) => new Promise(resolve => requests.push({ filters, signal, resolve })));
  const first = loader.load({ ...filters, q: "old" });
  const second = loader.load({ ...filters, q: "new" });
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(page([{ ...user, name: "New result" }]));
  await second;
  requests[0].resolve(page([{ ...user, name: "Old result" }]));
  await first;
  assert.equal(state.key, userFiltersKey({ ...filters, q: "new" }));
  assert.equal(state.items[0].name, "New result");
  assert.equal(userFiltersKey({ ...filters, q: "new " }), state.key);
  const cancelled = loader.load(filters);
  loader.cancel();
  requests[2].resolve(page());
  await cancelled;
  assert.equal(state.status, "loading");
});

test("Load More uses the returned cursor, prevents duplicate requests and merges IDs", async () => {
  let state, resolveMore;
  const cursors = [];
  const loader = createUsersListLoader(value => { state = value; }, async (_, cursor) => {
    cursors.push(cursor);
    return cursor ? new Promise(resolve => { resolveMore = resolve; }) : page([user], "next-page");
  });
  await loader.load(filters);
  const more = loader.loadMore(filters);
  await loader.loadMore(filters);
  assert.deepEqual(cursors, [null, "next-page"]);
  resolveMore(page([{ ...user, name: "Updated" }, { ...user, id: "second-id" }]));
  await more;
  assert.equal(state.items.length, 2);
  assert.equal(state.items[0].name, "Updated");
  assert.equal(state.pageInfo.hasMore, false);
});

test("Pagination failures preserve rows for retry, but authorization failures clear them", async () => {
  for (const kind of ["server", "network", "unauthorized", "forbidden"]) {
    let state;
    const loader = createUsersListLoader(value => { state = value; }, async (_, cursor) => {
      if (cursor) throw new UsersApiError(kind, "Failed");
      return page([user], "more");
    });
    await loader.load(filters);
    await loader.loadMore(filters);
    const sensitive = kind === "unauthorized" || kind === "forbidden";
    assert.equal(state.status, sensitive ? "error" : "ready");
    assert.equal(state.items.length, sensitive ? 0 : 1);
    assert.equal(state.error.kind, kind);
    assert.equal(state.loadingMore, false);
  }
});

test("Repeated user cursors produce an explicit pagination error", async () => {
  let state;
  const loader = createUsersListLoader(value => { state = value; }, async () => page([user], "same"));
  await loader.load(filters);
  await loader.loadMore(filters);
  assert.equal(state.error.kind, "malformed");
  assert.equal(state.items.length, 1);
});
