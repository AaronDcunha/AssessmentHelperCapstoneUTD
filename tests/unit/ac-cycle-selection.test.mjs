import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const realReact = require("react");
const cache = new Map();
let selection = "", context, providerMode = false;
let resource = { data: [], loading: false, error: null };
const pending = [];
const react = { ...realReact, useCallback: fn => fn, useContext: () => context,
  useState: initial => providerMode ? [selection, value => { selection = value; }] : [initial, () => {}] };
function load(filename) {
  const path = resolve(root, filename);
  if (cache.has(path)) return cache.get(path);
  const loaded = { exports: {} };
  const localRequire = name => {
    if (name === "react") return react;
    if (name === "./use-api-resource") return { useApiResource: () => resource };
    if (name === "@/components/ac/use-api-resource") return { useApiResource: (loader, fallback) => {
      pending.push(loader()); return { data: fallback, loading: false, error: null };
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
const { AcCycleProvider, CycleSelector } = load("src/components/ac/cycle-context.tsx");
function provider() {
  providerMode = true;
  context = AcCycleProvider({ children: null, canReadCycles: true }).props.value;
  providerMode = false;
  return context;
}
const cycles = [{ id: "actual-cycle-a", semester: { name: "Fall 2026" } }, { id: "actual-cycle-b", semester: { name: "Spring 2027" } }];

test("cycle selection handles zero, one, multiple, explicit and stale IDs without guessing current", () => {
  selection = ""; resource = { data: [], loading: false, error: null };
  assert.equal(provider().selectedCycle, null);
  resource.data = [cycles[0]];
  assert.equal(provider().selectedCycle.id, cycles[0].id);
  resource.data = cycles;
  assert.equal(provider().selectedCycle, null);
  const selector = CycleSelector({});
  selector.props.children[0].props.onChange({ target: { value: cycles[1].id } });
  assert.equal(provider().selectedCycle.id, cycles[1].id);
  resource.data = [cycles[0]];
  assert.equal(provider().selectedCycle, null, "A removed cycle must not keep driving requests");
});

test("monitoring screens wait for a real cycle, follow selection changes and support all-semester progress", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async input => {
    calls.push(String(input));
    return Response.json(String(input).includes("/observations") || String(input).includes("/attention") || String(input).includes("/alerts")
      ? { items: [], pageInfo: { nextCursor: null, hasMore: false } } : {});
  };
  const screens = [load("src/app/(main)/ac/dashboard-screen.tsx").default, load("src/app/(main)/ac/reports/reports-screen.tsx").default,
    load("src/app/(main)/ac/observations/progress-screen.tsx").default];
  async function render() { pending.length = 0; screens.forEach(screen => screen()); await Promise.all(pending); }
  try {
    selection = ""; resource.data = cycles; provider(); await render();
    assert.deepEqual(calls, [], "No invented /current or empty cycle requests");
    for (const cycle of cycles) {
      calls.length = 0; selection = cycle.id; provider(); await render();
      assert(calls.length > 0);
      assert(calls.every(path => path.startsWith(`/api/evaluation-cycles/${cycle.id}/`)));
    }
    calls.length = 0; selection = "all"; provider(); await render();
    assert.deepEqual(calls.sort(), cycles.map(c => `/api/evaluation-cycles/${c.id}/observations`).sort());
    calls.length = 0; resource.data = []; provider(); await render();
    assert.deepEqual(calls, []);
  } finally { globalThis.fetch = originalFetch; }
});
