import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Exercise the actual TypeScript components with the repository's existing Node test tools.
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const cache = new Map();
let currentUser = { id: "faculty-id", username: "faculty", name: "Faculty User", roles: ["Faculty"],
  permissions: ["profile.read.own", "observations.read.own"] };
function load(filename) {
  const path = resolve(root, filename);
  if (cache.has(path)) return cache.get(path);
  const loaded = { exports: {} };
  const localRequire = (name) => {
    if (name === "@/server/permissions") return { requireUser: async () => {
      if (!currentUser) throw new Error("Unauthenticated");
      return currentUser;
    } };
    if (!name.startsWith("@/") && !name.startsWith(".")) return require(name);
    const base = name.startsWith("@/") ? resolve(root, "src", name.slice(2)) : resolve(dirname(path), name);
    return load(existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`);
  };
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  new Function("require", "module", "exports", outputText)(localRequire, loaded, loaded.exports);
  cache.set(path, loaded.exports);
  return loaded.exports;
}

const { createNavigationConfig, filterNavigation } = load("src/components/layout/navigation-config.ts");
const { Sidebar } = load("src/components/layout/sidebar.tsx");
const config = createNavigationConfig({
  "faculty.dashboard": { href: "/dashboard" },
  "faculty.history": { unavailableReason: "History route is not implemented." },
});

test("History can be represented without inventing a destination or adding other role sections", () => {
  assert.deepEqual(config.map((section) => section.id), ["faculty"]);
  assert.deepEqual(config[0].items.map((item) => item.id), ["faculty.dashboard", "faculty.history"]);
  assert.equal(config[0].items[1].href, undefined);
  assert.equal(config[0].items[1].permission, undefined);
  assert.deepEqual(createNavigationConfig({}), []);
});

test("Unavailable History is denied by the same filter as a working destination", () => {
  const before = JSON.stringify(config);
  assert.deepEqual(filterNavigation(config, () => false), []);
  assert.deepEqual(filterNavigation(config, (item) => item.id === "faculty.dashboard")[0].items.map((item) => item.id), ["faculty.dashboard"]);
  assert.deepEqual(filterNavigation(config, (item) => item.id === "faculty.history")[0].items.map((item) => item.id), ["faculty.history"]);
  assert.equal(JSON.stringify(config), before);
});

const props = { expandedSections: { faculty: true }, onExpandedChange() {}, activeItemId: "faculty.dashboard" };
test("Authorized History renders as an accessible unavailable item with no broken URL", () => {
  const html = renderToStaticMarkup(createElement(Sidebar, { ...props, authorizedSections: config }));
  assert.match(html, /role="link" aria-disabled="true"/);
  assert.match(html, /History route is not implemented/);
  assert.doesNotMatch(html, /href="[^"]*history/i);
  assert.match(html, /href="\/dashboard"/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
});

test("Denied History is absent from the DOM even in a collapsed section", () => {
  const html = renderToStaticMarkup(createElement(Sidebar, { ...props, expandedSections: {}, sections: config, canAccess: () => false }));
  assert.doesNotMatch(html, /History|href="\/dashboard"|data-navigation-section/);
});

test("The application layout binds History to its implemented route and marks it active", async () => {
  const MainLayout = load("src/app/(main)/layout.tsx").default;
  const { facultyRoutes } = load("src/components/observations/faculty-routes.ts");
  const shell = await MainLayout({ children: null });
  const sections = shell.props.authorizedSections;
  const history = sections.flatMap((section) => section.items).find((item) => item.id === "faculty.history");
  assert.equal(history.href, facultyRoutes.history);
  assert.equal(history.href, "/observations/history");
  assert.equal(history.unavailableReason, undefined);
  assert.ok(existsSync(resolve(root, "src/app/(main)/observations/history/page.tsx")));
  const html = renderToStaticMarkup(createElement(Sidebar, { ...props, authorizedSections: sections, activeItemId: "faculty.history" }));
  assert.match(html, /href="\/observations\/history"/);
  assert.doesNotMatch(html, /aria-disabled="true"/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
});

test("Faculty navigation includes five working routes and real identity without Admin tools", async () => {
  const shell = await load("src/app/(main)/layout.tsx").default({ children: null });
  assert.deepEqual(shell.props.authorizedSections.map(s => s.id), ["faculty"]);
  assert.equal(shell.props.authorizedSections[0].items.length, 5);
  assert.equal(shell.props.user.name, currentUser.name);
  assert.equal(shell.props.headerUser.name, currentUser.name);
});

test("Admin tools require effective permission, not just an Admin label", async () => {
  const original = currentUser;
  try {
    currentUser = { ...original, roles: ["Admin"] };
    const layout = load("src/app/(main)/layout.tsx").default;
    assert.deepEqual((await layout({children:null})).props.authorizedSections.map(s=>s.id),["faculty"]);
    // Temporary fixture grants no longer add demo shortcuts to the product shell.
    currentUser = { ...currentUser, permissions: [...original.permissions, "test:admin"] };
    assert.deepEqual((await layout({children:null})).props.authorizedSections.map(s=>s.id),["faculty"]);
    currentUser = { ...currentUser, permissions: [...original.permissions, "users.read"] };
    const sections = (await layout({children:null})).props.authorizedSections;
    assert.deepEqual(sections.map(s=>s.id),["faculty","admin"]);
    const links = sections[1].items.map(item=>item.href);
    assert.deepEqual(links,["/admin","/admin/users"]);
    assert.equal(links.length,new Set(links).size);
  } finally { currentUser = original; }
});

test("Main layout rejects anonymous users", async () => {
  const original = currentUser;
  try {
    currentUser = null;
    await assert.rejects(load("src/app/(main)/layout.tsx").default({children:null}),/Unauthenticated/);
  } finally { currentUser = original; }
});
