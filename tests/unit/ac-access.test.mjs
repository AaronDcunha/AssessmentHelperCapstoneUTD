import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { acPermissions, canAccessAcPage } from "../../src/lib/ac-permissions.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
let user = null;
const cache = new Map();
function load(filename) {
  const path = resolve(root, filename);
  if (cache.has(path)) return cache.get(path);
  const loaded = { exports: {} };
  const localRequire = name => {
    if (name === "next/navigation") return { redirect: path => { throw new Error(`Redirect ${path}`); } };
    if (name === "@/server/permissions" || name === "./permissions") return { requireUser: async () => {
      if (!user) throw new Error("Redirect /login");
      return user;
    } };
    if (name === "@/components/layout/app-shell") return { AppShell: () => null };
    if (name.includes("-screen") || name.includes("cycle-form") || name.includes("template-editor") || name === "./observation-details") {
      return { default: () => null, CycleForm: () => null, ObservationTemplateEditor: () => null, ObservationDetails: () => null };
    }
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
const pages = [
  ["", "ac.dashboard"], ["cycles", "ac.cycles"], ["cycles/new", "ac.cycleCreate"],
  ["cycles/[cycleId]/edit", "ac.cycleEdit"], ["faculty", "ac.faculty"],
  ["observer-selection", "ac.observerSelection"],
  ["observations", "ac.progress"], ["observations/[observationId]", "ac.detail"],
  ["template", "ac.template"], ["reports", "ac.reports"], ["semester", "ac.semester"],
].map(([path, key]) => [load(`src/app/(main)/ac/${path ? path + "/" : ""}page.tsx`).default, key]);
const props = { params: Promise.resolve({ cycleId: "cycle-id", observationId: "observation-id" }) };
function identity(permissions) { return { id: "user-id", name: "User", roles: ["AC"], permissions }; }

test("all AC pages reject anonymous users and temporary fixture grants on direct requests", async () => {
  for (const [page] of pages) {
    user = null;
    await assert.rejects(page(props), /Redirect \/login/);
    user = identity(["test:ac", "test:admin", "observations.read.own"]);
    await assert.rejects(page(props), /Redirect \/forbidden/);
  }
});

test("every AC page enforces its own business grants, including nested edit/detail routes", async () => {
  for (const [page, key] of pages) {
    user = identity([...acPermissions[key]]);
    assert(await page(props), key);
    for (const removed of acPermissions[key]) {
      user = identity(acPermissions[key].filter(permission => permission !== removed));
      await assert.rejects(page(props), /Redirect \/forbidden/, `${key}: missing ${removed}`);
    }
  }
});

test("observation details only enable assessment loading for the separate assessment read grant", async () => {
  const detail = load("src/app/(main)/ac/observations/[observationId]/page.tsx").default;
  user = identity(["observations.read"]);
  assert.equal((await detail(props)).props.canReadAssessment, false);
  user = identity(["observations.read", "assessments.read"]);
  assert.equal((await detail(props)).props.canReadAssessment, true);
});

test("sidebar and server access agree, without requiring AC role names or test permissions", async () => {
  const layout = load("src/app/(main)/layout.tsx").default;
  for (const grants of [[], ["test:ac"], ["cycles.read", "observations.read"], [...new Set(Object.values(acPermissions).flat())]]) {
    user = { ...identity(grants), roles: ["Faculty"] };
    const shell = await layout({ children: null });
    const links = shell.props.authorizedSections.flatMap(section => section.items).filter(item => item.id.startsWith("ac."));
    const ids = new Set(links.map(item => item.id));
    for (const key of ["ac.dashboard", "ac.cycles", "ac.observerSelection", "ac.faculty", "ac.progress", "ac.template", "ac.reports", "ac.semester"]) {
      assert.equal(ids.has(key), canAccessAcPage(grants, key), key);
    }
  }
});
