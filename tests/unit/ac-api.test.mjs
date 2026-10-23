import assert from "node:assert/strict";
import test from "node:test";
import { acApi, ApiRequestError } from "../../src/lib/ac-api.ts";

test("AC reads use the documented cycle and observation endpoint paths", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ input: String(input), method: init?.method ?? "GET" });
    return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    await acApi.getReports("cycle 1");
    await acApi.getFacultyStatus("cycle 1", { evaluationStatus: "overdue" });
    await acApi.getAttention("cycle 1");
    await acApi.getObservations("cycle 1", { status: "in-progress" });
    await acApi.getMetrics("cycle 1");
    await acApi.getObservation("observation 1");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls.map((call) => call.input), [
    "/api/evaluation-cycles/cycle%201/reports",
    "/api/evaluation-cycles/cycle%201/faculty-status?evaluationStatus=overdue",
    "/api/evaluation-cycles/cycle%201/attention",
    "/api/evaluation-cycles/cycle%201/observations?status=in-progress",
    "/api/evaluation-cycles/cycle%201/metrics",
    "/api/observations/observation%201",
  ]);
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
    await acApi.updateCycle("cycle-1", { ...payload, expectedRevision: 2 });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls.map(({ input, method }) => ({ input, method })), [
    { input: "/api/evaluation-cycles", method: "POST" },
    { input: "/api/evaluation-cycles/cycle-1", method: "PATCH" },
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
