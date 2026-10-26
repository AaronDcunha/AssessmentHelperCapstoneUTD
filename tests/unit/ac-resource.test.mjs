import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";

test("changing the selected cycle hides old data and ignores late responses", async () => {
  // Run the real hook with controlled state/effect scheduling; no DOM dependency.
  let state = null, lastDependencies, cleanup;
  const react = {
    useState: () => [state, value => { state = value; }],
    useEffect: (effect, dependencies) => {
      if (lastDependencies && dependencies.every((value, index) => value === lastDependencies[index])) return;
      cleanup?.(); lastDependencies = dependencies; cleanup = effect();
    },
  };
  const { outputText } = ts.transpileModule(readFileSync(new URL("../../src/components/ac/use-api-resource.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", outputText)(() => react, loaded, loaded.exports);
  const { useApiResource } = loaded.exports;
  const fallback = [];
  let resolveA, resolveB;
  const loaderA = () => new Promise(resolve => { resolveA = resolve; });
  const loaderB = () => new Promise(resolve => { resolveB = resolve; });
  assert.equal(useApiResource(loaderA, fallback).loading, true);
  useApiResource(loaderB, fallback);
  resolveA(["old cycle"]); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(useApiResource(loaderB, fallback), { data: [], loading: true, error: null });
  resolveB(["selected cycle"]); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(useApiResource(loaderB, fallback), { data: ["selected cycle"], loading: false, error: null });
  const loaderC = async () => ["another cycle"];
  assert.deepEqual(useApiResource(loaderC, fallback), { data: [], loading: true, error: null });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(useApiResource(loaderC, fallback).data, ["another cycle"]);
  cleanup?.();
});

test("an error-only fallback is not exposed until the loader fails", async () => {
  let state = null, effect;
  const react = {
    useState: () => [state, value => { state = value; }],
    useEffect: callback => { effect = callback; },
  };
  const { outputText } = ts.transpileModule(readFileSync(new URL("../../src/components/ac/use-api-resource.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", outputText)(() => react, loaded, loaded.exports);
  const loader = async () => { throw new Error("Unavailable"); };
  const empty = [], demo = ["demo"];

  assert.deepEqual(loaded.exports.useApiResource(loader, empty, demo), { data: [], loading: true, error: null });
  effect(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(loaded.exports.useApiResource(loader, empty, demo), { data: ["demo"], loading: false, error: "Unavailable" });
});
