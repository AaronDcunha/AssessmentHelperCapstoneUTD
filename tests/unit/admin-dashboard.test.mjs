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
      useRouter: () => ({ push() {}, refresh() {} }),
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
const UsersPage = load("src/app/(main)/admin/users/page.tsx").default;
const CreateUserPage = load("src/app/(main)/admin/users/new/page.tsx").default;
const EditUserPage = load("src/app/(main)/admin/users/[userId]/page.tsx").default;
const RolesPage = load("src/app/(main)/admin/roles/page.tsx").default;
const HiringLevelsPage = load("src/app/(main)/admin/hiring-levels/page.tsx").default;
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

test("The shared shell marks /admin active, retains Faculty links, omits demo shortcuts and uses real identity", async () => {
  currentUser = { ...admin, permissions: [...admin.permissions, "test:admin"] };
  const shell = await MainLayout({ children: await Dashboard() });
  const faculty = shell.props.authorizedSections.find(section => section.id === "faculty");
  const adminSection = shell.props.authorizedSections.find(section => section.id === "admin");
  assert.equal(faculty.items.length, 5);
  assert.deepEqual(adminSection.items.slice(0, 4).map(item => item.href), ["/admin", ...plannedRoutes]);
  assert.equal(adminSection.items.length, 4);
  assert.ok(!shell.props.authorizedSections.flatMap(section => section.items).some(item => adminTestPages.some(testPage => testPage.href === item.href)));
  const { acPermissions, canAccessAcPage } = load("src/lib/ac-permissions.ts");
  const acSection = shell.props.authorizedSections.find(section => section.id === "ac");
  const acIds = ["ac.dashboard", "ac.cycles", "ac.observerSelection", "ac.faculty", "ac.progress", "ac.template", "ac.reports", "ac.semester"];
  assert.deepEqual(acSection.items.map(item => item.id),
    acIds.filter(id => id in acPermissions && canAccessAcPage(currentUser.permissions, id)));
  assert.equal(shell.props.pageHeaders["/ac"].title, "AC Dashboard");
  const html = renderToStaticMarkup(shell);
  assert.match(html, /<a(?=[^>]*href="\/admin")(?=[^>]*aria-current="page")[^>]*>/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /<h1[^>]*>Admin Dashboard<\/h1>/);
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.match(html, /Admin Account/);
  assert.doesNotMatch(html, /Jordan Davis/);
  assert.match(html, /Fall 2026/);
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

test("Users route enforces users.read and the shared shell marks Users active", async () => {
  currentUser = null;
  await assert.rejects(UsersPage(), error => error.destination === "/login");
  currentUser = { ...admin, permissions: rolePermissions.AC };
  await assert.rejects(UsersPage(), error => error.destination === "/forbidden");
  currentUser = admin;
  pathname = "/admin/users";
  const shell = await MainLayout({ children: await UsersPage() });
  const html = renderToStaticMarkup(shell);
  assert.match(html, /<h1[^>]*>Users<\/h1>/);
  assert.match(html, /<a(?=[^>]*href="\/admin\/users")(?=[^>]*aria-current="page")[^>]*>/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /href="\/admin\/users\/new"/);
  assert.match(html, /Loading users/);
  currentUser = { ...admin, permissions: ["users.read"] };
  assert.equal((await UsersPage()).props.canManageUsers, false);
});

test("Create/Edit routes enforce users.manage and share the active Users navigation and mode header", async () => {
  for (const identity of [null, { ...admin, permissions: ["users.read"] }, { ...admin, permissions: rolePermissions.AC }]) {
    currentUser = identity;
    const destination = identity ? "/forbidden" : "/login";
    await assert.rejects(CreateUserPage(), error => error.destination === destination);
    await assert.rejects(EditUserPage({ params: Promise.resolve({ userId: "user-id" }) }), error => error.destination === destination);
  }
  currentUser = admin;
  for (const [path, page, title] of [
    ["/admin/users/new", await CreateUserPage(), "Create User"],
    ["/admin/users/user-id", await EditUserPage({ params: Promise.resolve({ userId: "user-id" }) }), "Edit User"],
  ]) {
    pathname = path;
    const html = renderToStaticMarkup(await MainLayout({ children: page }));
    assert.match(html, new RegExp(`<h1[^>]*>${title}</h1>`));
    assert.match(html, /<a(?=[^>]*href="\/admin\/users")(?=[^>]*aria-current="page")[^>]*>/);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
    assert.equal(html.includes(">Delete User</button>"), title === "Edit User");
    assert.match(html, /<form[^>]*method="post"/);
  }
});

test("Roles route requires roles.read and only the specific permission-management grant enables editing", async () => {
  currentUser = null;
  await assert.rejects(RolesPage(), error => error.destination === "/login");
  for (const permissions of [rolePermissions.Faculty, rolePermissions.AC, ["role-permissions.manage"], ["test:admin"]]) {
    currentUser = { ...admin, permissions };
    await assert.rejects(RolesPage(), error => error.destination === "/forbidden");
  }
  for (const permissions of [["roles.read"], ["roles.read", "roles.manage"], ["roles.read", "permissions.read"]]) {
    currentUser = { ...admin, permissions };
    assert.equal((await RolesPage()).props.canManage, false);
  }
  currentUser = { ...admin, roles: ["Custom"], permissions: ["roles.read", "permissions.read", "role-permissions.manage"] };
  const page = await RolesPage(); assert.equal(page.props.canManage, true);
  pathname = "/admin/roles";
  const html = renderToStaticMarkup(await MainLayout({ children: page }));
  assert.match(html, /<h1[^>]*>Roles &amp; Permissions<\/h1>/);
  assert.match(html, /<a(?=[^>]*href="\/admin\/roles")(?=[^>]*aria-current="page")[^>]*>/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /Loading roles and permissions/);
});

test("Hiring levels require the read grant; management controls use the effective write grant and navigation remains active", async () => {
  currentUser = null; await assert.rejects(HiringLevelsPage(), error => error.destination === "/login");
  for (const permissions of [rolePermissions.Faculty, rolePermissions.AC, ["hiring-levels.manage"], ["test:admin"]]) {
    currentUser = { ...admin, permissions }; await assert.rejects(HiringLevelsPage(), error => error.destination === "/forbidden");
  }
  currentUser = { ...admin, permissions: ["hiring-levels.read"] };
  assert.equal((await HiringLevelsPage()).props.canManage, false);
  assert.doesNotMatch(renderToStaticMarkup(await HiringLevelsPage()), />Add Hiring Level<\/button>/);
  currentUser = { ...admin, roles: ["Custom"], permissions: ["hiring-levels.read", "hiring-levels.manage"] };
  const page = await HiringLevelsPage(); assert.equal(page.props.canManage, true); pathname = "/admin/hiring-levels";
  const html = renderToStaticMarkup(await MainLayout({ children: page }));
  assert.match(html, /<h1[^>]*>Hiring Levels &amp; Frequency<\/h1>/);
  assert.match(html, /<a(?=[^>]*href="\/admin\/hiring-levels")(?=[^>]*aria-current="page")[^>]*>/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /Loading hiring levels/);
});

test("All Admin headers preserve their Figma semester context independently of live Faculty data", async () => {
  const expectedSubtitle = "Fall 2026";
  for (const path of ["/admin", "/admin/users", "/admin/users/new", "/admin/users/user-id", "/admin/roles", "/admin/hiring-levels"]) {
    pathname = path;
    const html = renderToStaticMarkup(await MainLayout({ children: null }));
    assert.match(html, new RegExp(`<p[^>]*>${expectedSubtitle}</p>`));
    assert.match(html, /href="\/notifications"/);
    assert.equal((html.match(/href="\/notifications"/g) || []).length, 1);
    assert.match(html, /aria-label="Account options for Admin Account"/);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  }
});

test("Admin header options preserve Faculty headers and existing AC test-page defaults", async () => {
  for (const [path, hasSemester, hasBell] of [["/dashboard", false, true], ["/dashboard/evaluation", false, true], ["/observations", false, true], ["/test/ac", false, true]]) {
    pathname = path;
    const html = renderToStaticMarkup(await MainLayout({ children: null }));
    assert.equal(html.includes("Fall 2026"), hasSemester);
    assert.equal(html.includes('href="/notifications"'), hasBell);
  }
});
