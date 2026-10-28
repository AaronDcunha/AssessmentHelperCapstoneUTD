import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Test the actual TypeScript module using the already installed compiler and
// Node's built-in runner; no new test framework or dependency is required.
const source = await readFile(
  new URL("../../src/lib/observations-api.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const {
  getMyObservations,
  getMyObservationHistory,
  getObservation,
  getObservationFormResources,
  ObservationApiError,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

test("personal history reads encode filters and use the current session", async (t) => {
  const controller = new AbortController();
  const payload = { backendContract: "not-yet-defined" };
  t.mock.method(globalThis, "fetch", async (path, options) => {
    const url = new URL(path, "http://localhost");
    assert.equal(url.pathname, "/api/me/observations");
    assert.equal(url.searchParams.get("cycleId"), "cycle & 1");
    assert.equal(url.searchParams.get("participation"), "observer");
    assert.equal(url.searchParams.get("status"), "a value with spaces");
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    assert.equal(options.signal, controller.signal);
    return Response.json(payload);
  });
  assert.deepEqual(
    await getMyObservations(
      { cycleId: "cycle & 1", participation: "observer", status: "a value with spaces" },
      { signal: controller.signal },
    ),
    payload,
  );
});

test("authorization failures retain the HTTP status without exposing the error body", async (t) => {
  for (const status of [401, 403, 404, 500]) {
    const mocked = t.mock.method(
      globalThis,
      "fetch",
      async () => new Response("private faculty information", { status }),
    );
    await assert.rejects(getMyObservations(), (error) => {
      assert.ok(error instanceof ObservationApiError);
      assert.equal(error.status, status);
      assert.ok(!error.message.includes("private faculty information"));
      return true;
    });
    mocked.mock.restore();
  }
});

test("detail IDs cannot inject another path or query; empty IDs make no request", async (t) => {
  const mocked = t.mock.method(globalThis, "fetch", async (path) => {
    assert.equal(path, "/api/observations/id%2Fwith%3Fquery%3D1");
    return Response.json({});
  });
  await assert.rejects(getObservation(" "), TypeError);
  assert.equal(mocked.mock.callCount(), 0);
  await getObservation("id/with?query=1");
  assert.equal(mocked.mock.callCount(), 1);
});

test("cancellation propagates so a UI can discard superseded requests", async (t) => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(globalThis, "fetch", async (_path, options) => {
    options.signal.throwIfAborted();
  });
  await assert.rejects(
    getMyObservations({}, { signal: controller.signal }),
    (error) => error.name === "AbortError",
  );
});

test("a successful HTTP response with malformed JSON is not treated as history", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("not json"));
  await assert.rejects(getMyObservations(), /unreadable response/);
});

test("cancellation during body reading is preserved instead of reported as bad JSON", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => {
      controller.abort();
      throw controller.signal.reason;
    },
  }));
  await assert.rejects(
    getMyObservations({}, { signal: controller.signal }),
    (error) => error.name === "AbortError",
  );
});

test("submitted forms read their assigned template and assessment without mutations", async (t) => {
  const paths = [];
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (path, options) => {
    paths.push(path);
    assert.equal(options.method, "GET");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.signal, controller.signal);
    return Response.json({ path });
  });
  const result = await getObservationFormResources("id/1?", { signal: controller.signal });
  assert.deepEqual(paths.sort(), [
    "/api/observations/id%2F1%3F/assessment",
    "/api/observations/id%2F1%3F/template",
  ]);
  assert.equal(result.assessment.path, paths[0]);
  assert.equal(result.template.path, paths[1]);
});

test("dot segments cannot normalize into another resource", async (t) => {
  const mocked = t.mock.method(globalThis, "fetch", async () => Response.json({}));
  for (const id of [".", "..", "", " "]) {
    await assert.rejects(getObservation(id), TypeError);
    await assert.rejects(getObservationFormResources(id), TypeError);
  }
  assert.equal(mocked.mock.callCount(), 0);
});

test("history retrieves every page from the shared endpoint before filtering locally", async (t) => {
  const paths = [];
  t.mock.method(globalThis, "fetch", async (path) => {
    const url = new URL(path, "http://localhost");
    paths.push(url);
    assert.equal(url.pathname, "/api/me/observations");
    assert.equal(url.searchParams.get("limit"), "100");
    return Response.json(
      url.searchParams.has("cursor")
        ? { items: [{ id: "second" }], pageInfo: { hasMore: false, nextCursor: null } }
        : { items: [{ id: "first" }], pageInfo: { hasMore: true, nextCursor: "first" } },
    );
  });
  assert.deepEqual((await getMyObservationHistory()).items, [{ id: "first" }, { id: "second" }]);
  assert.equal(paths[1].searchParams.get("cursor"), "first");
});

test("repeating or malformed pagination cannot silently truncate history or loop forever", async (t) => {
  for (const pageInfo of [
    { hasMore: true, nextCursor: "same" },
    { hasMore: true, nextCursor: null },
    { hasMore: false, nextCursor: "unexpected" },
  ]) {
    const mocked = t.mock.method(globalThis, "fetch", async () =>
      Response.json({ items: [{ id: "one" }], pageInfo }),
    );
    await assert.rejects(getMyObservationHistory(), /cursor/);
    mocked.mock.restore();
  }
});
