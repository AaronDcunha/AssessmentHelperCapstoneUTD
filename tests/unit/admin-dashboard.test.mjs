import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { rolePermissions } from "../../prisma/seed-data.mjs";

// Render the actual routes, shell and guards with session/database identity fixtures.
// TypeScript transpilation stays in memory, as in faculty-navigation.test.mjs.
const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const cache = new Map();
const admin = { id: "admin-id", name: "Admin Account", roles: ["Admin"], permissions: rolePermissions.Admin };
let currentUser = admin;
let pathname = "/admin";

function load(filename) {
  const path = resolve(root, filename);
  if (cache.has(path)) return cache.get(path);
  const loaded = { exports: {} };
  const localRequire = name => {
    if (name === "@/auth") return { auth: async () => currentUser ? { user: { id: currentUser.id } } : null };
    if (path.endsWith("permissions.ts") && name === "./database-auth") {
      return { resolveDatabaseUser: async id => currentUser?.id === id ? currentUser : null };
    }
    if (name === "next/navigation") return {
      usePathname: () => pathname,
      redirect: destination => { throw Object.assign(new Error("Redirect"), { destination }); },
    };
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

const Dashboard = load("src/app/(main)/admin/page.tsx").default;
const MainLayout = load("src/app/(main)/layout.tsx").default;
const { Section } = load("src/components/ui/section.tsx");
const { adminTestPages } = load("src/components/layout/navigation-config.ts");
const plannedRoutes = ["/admin/users", "/admin/roles", "/admin/hiring-levels"];

test.afterEach(() => { currentUser = admin; pathname = "/admin"; });

test("The /admin page renders Administration and the three planned destinations", async () => {
  const html = renderToStaticMarkup(await Dashboard());
  assert.match(html, /<h2[^>]*>Administration<\/h2>/);
  assert.match(html, /<nav aria-label="Administration"/);
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]), plannedRoutes);
  assert.match(html, />Users<\/a>/);
  assert.match(html, />Roles &amp; Permissions<\/a>/);
  assert.match(html, />Hiring Levels<\/a>/);
});

test("The actual server guard redirects anonymous, Faculty, AC and fixture-only access", async () => {
  currentUser = null;
  await assert.rejects(Dashboard(), error => error.destination === "/login");
  for (const permissions of [rolePermissions.Faculty, rolePermissions.AC, ["test:admin"], []]) {
    currentUser = { ...admin, permissions };
    await assert.rejects(Dashboard(), error => error.destination === "/forbidden");
    const shell = await MainLayout({ children: null });
    assert.ok(!shell.props.authorizedSections.flatMap(section => section.items).some(item => item.href === "/admin"));
  }
});

test("The shared shell marks /admin active, retains Faculty/test links and uses real identity", async () => {
  currentUser = { ...admin, permissions: [...admin.permissions, "test:admin"] };
  const shell = await MainLayout({ children: await Dashboard() });
  const faculty = shell.props.authorizedSections.find(section => section.id === "faculty");
  const adminSection = shell.props.authorizedSections.find(section => section.id === "admin");
  assert.equal(faculty.items.length, 5);
  assert.deepEqual(adminSection.items.slice(0, 4).map(item => item.href), ["/admin", ...plannedRoutes]);
  assert.deepEqual(adminSection.items.slice(4).map(item => item.href), adminTestPages.map(item => item.href));
  assert.ok(!shell.props.authorizedSections.some(section => section.id === "ac"));
  const html = renderToStaticMarkup(shell);
  assert.match(html, /<a(?=[^>]*href="\/admin")(?=[^>]*aria-current="page")[^>]*>/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /<h1[^>]*>Admin Dashboard<\/h1>/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /Admin Account/);
  assert.doesNotMatch(html, /Jordan Davis|Fall 2026/);
  assert.match(html, /md:p-ah-48/);
});

test("Dashboard and sidebar links both follow effective destination permissions", async () => {
  currentUser = { ...admin, permissions: ["users.read"] };
  const html = renderToStaticMarkup(await Dashboard());
  assert.match(html, /href="\/admin\/users"/);
  assert.doesNotMatch(html, /href="\/admin\/(roles|hiring-levels)"/);
  const shell = await MainLayout({ children: null });
  assert.deepEqual(shell.props.authorizedSections.flatMap(section => section.items).map(item => item.href), ["/admin", "/admin/users"]);
});

test("The plain Section keeps its accessible heading while the default retains card styling", () => {
  const props = { title: "Administration", children: "Content" };
  const plain = renderToStaticMarkup(createElement(Section, { ...props, variant: "plain" }));
  const card = renderToStaticMarkup(createElement(Section, props));
  assert.match(plain, /<section aria-labelledby="([^"]+)"[^>]*>.*<h2 id="\1"/);
  assert.doesNotMatch(plain, /bg-surface|border-border|p-ah-24/);
  assert.match(card, /rounded-ah-12 border border-border bg-surface p-ah-24/);
});
