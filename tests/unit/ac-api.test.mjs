import assert from "node:assert/strict";
import test from "node:test";
import { acApi, ApiRequestError } from "../../src/lib/ac-api.ts";

test("AC reads use the documented cycle and observation endpoint paths", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), method: init?.method ?? "GET" });
    const list = /\/(faculty-status|attention|observations|signups)(\?|$)/.test(String(input));
    return Response.json(list ? { items: [], pageInfo: { nextCursor: null, hasMore: false } } : {});
  };

  try {
    await acApi.getReports("cycle 1");
    await acApi.getFacultyStatus("cycle 1", { evaluationStatus: "overdue" });
    await acApi.getAttention("cycle 1");
    await acApi.getObservations("cycle 1", { status: "in-progress" });
    await acApi.getObserverSelectionSignups("cycle 1");
    await acApi.getObservationCandidates("observation 1");
    await acApi.getMetrics("cycle 1");
    await acApi.getObservation("observation 1");
    await acApi.getObservationTemplate("observation 1");
    await acApi.getObservationAssessment("observation 1");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls.map((call) => call.input), [
    "/api/evaluation-cycles/cycle%201/reports",
    "/api/evaluation-cycles/cycle%201/faculty-status?evaluationStatus=overdue",
    "/api/evaluation-cycles/cycle%201/attention",
    "/api/evaluation-cycles/cycle%201/observations?status=in-progress",
    "/api/evaluation-cycles/cycle%201/signups",
    "/api/observations/observation%201/candidates",
    "/api/evaluation-cycles/cycle%201/metrics",
    "/api/observations/observation%201",
    "/api/observations/observation%201/template",
    "/api/observations/observation%201/assessment",
  ]);
});

test("all list readers unwrap envelopes and retrieve every page without losing filters", async () => {
  const originalFetch = globalThis.fetch;
  const readers = [
    () => acApi.getEvaluationCycles({ status: "signup" }),
    () => acApi.getFacultyStatus("cycle-id", { evaluationStatus: "overdue" }),
    () => acApi.getAttention("cycle-id", { issue: "unmatched" }),
    () => acApi.getObservations("cycle-id", { assessmentStatus: "submitted" }),
    () => acApi.getObserverSelectionSignups("cycle-id"),
    () => acApi.getHiringLevels(),
  ];
  try {
    for (const read of readers) {
      const paths = [];
      globalThis.fetch = async input => {
        paths.push(String(input));
        return Response.json(paths.length === 1
          ? { items: [{ id: "first" }], pageInfo: { nextCursor: "next page", hasMore: true } }
          : { items: [{ id: "second" }], pageInfo: { nextCursor: null, hasMore: false } });
      };
      assert.deepEqual(await read(), [{ id: "first" }, { id: "second" }]);
      const first = new URL(paths[0], "http://test"), second = new URL(paths[1], "http://test");
      assert.equal(first.pathname, second.pathname);
      for (const [key, value] of first.searchParams) assert.equal(second.searchParams.get(key), value);
      assert.equal(second.searchParams.get("cursor"), "next page");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("empty lists remain arrays; malformed envelopes and repeated cursors fail clearly", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ items: [], pageInfo: { nextCursor: null, hasMore: false } });
    assert.deepEqual(await acApi.getEvaluationCycles(), []);
    for (const value of [null, [], {}, { items: [], pageInfo: { nextCursor: null, hasMore: true } },
      { items: [], pageInfo: { nextCursor: "repeat", hasMore: true } }]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return Response.json(value); };
      await assert.rejects(acApi.getEvaluationCycles(), ApiRequestError);
      assert(calls <= 2, "Pagination must not loop indefinitely");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("AC writes use POST for create and PATCH for edit", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), method: init?.method, body: init?.body });
    return new Response(JSON.stringify({ id: "cycle-1" }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const payload = { semesterId: "26f", signupDeadline: "2026-10-31", observationDeadline: "2026-11-30", feedbackDeadline: "2026-12-07" };

  try {
    await acApi.createCycle(payload);
    const { semesterId, ...deadlines } = payload;
    assert.ok(semesterId);
    await acApi.updateCycle("cycle-1", { ...deadlines, expectedRevision: 2 });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls.map(({ input, method }) => ({ input, method })), [
    { input: "/api/evaluation-cycles", method: "POST" },
    { input: "/api/evaluation-cycles/cycle-1", method: "PATCH" },
  ]);
});

test("observer-selection mutations use the documented paths, methods and bodies", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), method: init?.method, body: JSON.parse(String(init?.body)) });
    return Response.json({ generationId: "generation-1", releasedObservationIds: [], candidateCount: 0 });
  };
  try {
    await acApi.generateRecommendations("cycle 1");
    await acApi.releaseRecommendations("cycle 1", { generationId: "generation 1", observationIds: ["observation 1"] });
    await acApi.regenerateObservationRecommendations("observation 1", { expectedRevision: 3 });
  } finally { globalThis.fetch = originalFetch; }

  assert.deepEqual(calls, [
    { input: "/api/evaluation-cycles/cycle%201/recommendations/generate", method: "POST", body: {} },
    { input: "/api/evaluation-cycles/cycle%201/recommendations/release", method: "POST", body: { generationId: "generation 1", observationIds: ["observation 1"] } },
    { input: "/api/observations/observation%201/recommendations/regenerate", method: "POST", body: { expectedRevision: 3 } },
  ]);
});

test("non-success responses reject with a status-aware error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 404 });
  try {
    await assert.rejects(acApi.getReports("missing"), (error) => error instanceof ApiRequestError && error.status === 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
