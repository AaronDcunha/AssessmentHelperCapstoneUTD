import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, Script } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const cases = [
  ["JD", "JD"], [" jd ", "JD"], ["ABCDEFGH", "AB"],
  ["Alexandra Catherine Montgomery", "AM"], ["J D", "JD"], ["\u00dfeta", "SS"],
  ["e\u0301 o\u0308", "\u00c9\u00d6"], ["q\u0301rZ", "Q\u0301R"],
  ["\u674e\u5c0f\u9f8d", "\u674e\u5c0f"],
  ["\u{1f600}\u{1f680}X", "\u{1f600}\u{1f680}"],
  ["\u{1f469}\u200d\u{1f4bb}\u{1f680}X", "\u{1f469}\u200d\u{1f4bb}\u{1f680}"],
  ["\u{1f44d}\u{1f3fd}\u{1f680}X", "\u{1f44d}\u{1f3fd}\u{1f680}"],
  ["\u{1f1fa}\u{1f1f8}\u{1f1e8}\u{1f1e6}X", "\u{1f1fa}\u{1f1f8}\u{1f1e8}\u{1f1e6}"],
  ["1\ufe0f\u20e32\ufe0f\u20e3X", "1\ufe0f\u20e32\ufe0f\u20e3"],
  ["\u{1f3f3}\ufe0f\u200d\u{1f308}\u{1f680}X", "\u{1f3f3}\ufe0f\u200d\u{1f308}\u{1f680}"],
  ["\u{1f3f4}\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}AX", "\u{1f3f4}\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}A"],
  ["\u{1f468}\u200d\u{1f469}\u200d\u{1f467} Alex", "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}A"],
];

// An implementation with different Unicode boundaries must never receive Unicode input.
class AsciiOnlySegmenter {
  segment(value) {
    assert.match(value, /^[a-z0-9]+$/i);
    return Array.from(value, (segment) => ({ segment }));
  }
}

const environments = [
  ["native", { Segmenter: Intl.Segmenter }],
  ["Segmenter unavailable", {}],
  ["Segmenter noncallable", { Segmenter: {} }],
  ["Intl unavailable", undefined],
  ["Unicode delegation forbidden", { Segmenter: AsciiOnlySegmenter }],
];

// Load actual TS/TSX modules into an isolated realm, without changing host Intl or writing files.
function runtime(intl) {
  const context = createContext({ Intl: intl });
  const cache = new Map();
  function load(filename) {
    const path = resolve(root, filename);
    if (cache.has(path)) return cache.get(path);
    const loadedModule = { exports: {} };
    cache.set(path, loadedModule.exports);
    const localRequire = (name) => {
      if (!name.startsWith("@/") && !name.startsWith(".")) return require(name);
      const base = name.startsWith("@/") ? resolve(root, "src", name.slice(2)) : resolve(dirname(path), name);
      return load(existsSync(`${base}.tsx`) ? `${base}.tsx` : `${base}.ts`);
    };
    const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    });
    const evaluate = new Script(`(function(require, module, exports) { ${outputText}\n})`, { filename: path }).runInContext(context);
    evaluate(localRequire, loadedModule, loadedModule.exports);
    cache.set(path, loadedModule.exports);
    return loadedModule.exports;
  }
  return load;
}

const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const native = runtime({ Segmenter: Intl.Segmenter });
const referenceAvatar = native("src/components/ui/avatar.tsx").Avatar;

for (const [name, intl] of environments) {
  test(`${name}: Avatar imports and preserves Unicode initials and markup`, () => {
    const { Avatar } = runtime(intl)("src/components/ui/avatar.tsx");
    for (const [initials, expected] of cases) {
      const props = { initials, "aria-label": "Sample full name" };
      const output = render(Avatar, props);
      assert.ok(output.includes(`>${expected}</span>`), JSON.stringify(initials));
      assert.equal(output, render(referenceAvatar, props), "API availability must not change server/client HTML");
    }
  });

  test(`${name}: appearance, accessibility, sizing and missing-initials fallback remain intact`, () => {
    const { Avatar } = runtime(intl)("src/components/ui/avatar.tsx");
    const inputs = [
      {}, { initials: null }, { initials: "" }, { initials: "   " },
      { initials: "JD", decorative: true }, { initials: "JD", "aria-labelledby": "name" },
      { initials: "JD", "aria-label": " " }, { initials: "JD", size: 64, className: "custom", id: "avatar" },
      ...[0, -1, NaN, Infinity].map((size) => ({ initials: "JD", size })),
    ];
    for (const props of inputs) assert.equal(render(Avatar, props), render(referenceAvatar, props));
    const output = render(Avatar, {});
    assert.match(output, /width:40px;height:40px/);
    assert.match(output, /bg-light text-label text-sidebar/);
    assert.match(output, /aria-hidden="true"/);
    assert.match(output, /<svg/);
  });

  test(`${name}: PageHeader and Sidebar import and render their actual Avatar dependency`, () => {
    const load = runtime(intl);
    const headerProps = { title: "Sample header", subtitle: "Sample semester", user: { name: "Sample user", initials: "\u{1f469}\u200d\u{1f4bb}A" } };
    assert.equal(render(load("src/components/layout/page-header.tsx").PageHeader, headerProps), render(native("src/components/layout/page-header.tsx").PageHeader, headerProps));
    for (const initials of ["e\u0301 o\u0308", undefined]) {
      const sidebarProps = { authorizedSections: [], expandedSections: {}, onExpandedChange() {}, user: { name: "Sample user", initials } };
      assert.equal(render(load("src/components/layout/sidebar.tsx").Sidebar, sidebarProps), render(native("src/components/layout/sidebar.tsx").Sidebar, sidebarProps));
    }
  });
}
