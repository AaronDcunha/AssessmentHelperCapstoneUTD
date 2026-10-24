import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url), cache = new Map();
function load(filename) {
  const path = resolve(root, filename);
  if (cache.has(path)) return cache.get(path);
  const loaded = { exports: {} };
  const localRequire = name => {
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
const { loadObservationAssessment } = load("src/lib/ac-assessment.ts");
const { AssessmentView } = load("src/components/ac/assessment-view.tsx");
const { ObservationTrackingDetails } = load("src/components/ac/observation-tracking-details.tsx");
const template = {
  id: "assigned-template", title: "Assigned historical template",
  criteria: [
    { id: "text", key: "text", prompt: "Written response", type: "text", order: 1, required: false },
    { id: "rating", key: "rating", prompt: "Observed engagement", type: "rating", order: 0, required: true,
      options: [{ value: 0, label: "Not observed" }, { value: 10, label: "Observed" }] },
    { id: "missing", key: "missing", prompt: "Unanswered question", type: "text", order: 2, required: false },
  ],
  commentPrompts: [{ id: "comment", prompt: "Strengths", order: 0, required: false }],
  signatureLabels: { observer: "Observer acknowledgement", observee: "Observee acknowledgement" },
};
const assessment = {
  id: "assessment", observationId: "observation 1", templateVersionId: template.id, status: "submitted", revision: 1,
  answers: [{ criterionId: "rating", value: 0 }, { criterionId: "text", value: "<script>alert('unsafe')</script>\nSecond line" }, { criterionId: "missing", value: null }],
  comments: [{ promptId: "comment", text: "Clear examples" }], submittedAt: "2026-10-23T12:00:00Z",
  acknowledgements: [{ actorId: "observer", participantRole: "observer", acknowledgedAt: "2026-10-23T12:00:00Z" }],
  allowedActions: ["edit", "submit"],
};
const response = { observationId: assessment.observationId, templateVersionId: template.id, assessment, allowedActions: ["edit"] };

test("loads only the observation's assessment and assigned template using GET requests", async () => {
  const originalFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (path, init) => {
    calls.push({ path: String(path), method: init?.method ?? "GET" });
    return Response.json(String(path).endsWith("/assessment") ? response : template);
  };
  try {
    assert.deepEqual(await loadObservationAssessment("observation 1"), { assessment, template });
    assert.deepEqual(calls, [
      { path: "/api/observations/observation%201/assessment", method: "GET" },
      { path: "/api/observations/observation%201/template", method: "GET" },
    ]);
  } finally { globalThis.fetch = originalFetch; }
});

test("no visible assessment does not trigger an unrelated current-template lookup", async () => {
  const originalFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async path => { calls.push(String(path)); return Response.json({ ...response, assessment: null }); };
  try {
    assert.equal(await loadObservationAssessment("observation 1"), null);
    assert.equal(calls.length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("denied/unavailable responses and mismatched records never produce a displayed assessment", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [401, 403, 404, 500]) {
      globalThis.fetch = async () => new Response(null, { status });
      await assert.rejects(loadObservationAssessment("observation 1"), error => error.status === status);
    }
    for (const bad of [{ ...response, observationId: "someone-else" },
      { ...response, assessment: { ...assessment, observationId: "someone-else" } },
      { ...response, templateVersionId: "different-template" },
      { ...response, assessment: { ...assessment, templateVersionId: "different-template" } }]) {
      globalThis.fetch = async path => Response.json(String(path).endsWith("/assessment") ? bad : template);
      await assert.rejects(loadObservationAssessment("observation 1"));
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("read-only view maps answers by ID, preserves zero/custom scales and escapes answer text", () => {
  const html = renderToStaticMarkup(createElement(AssessmentView, { template, assessment }));
  assert(html.includes(template.title));
  assert(html.indexOf("Observed engagement") < html.indexOf("Written response"));
  assert.match(html, /aria-readonly="true"/);
  assert.match(html, /checked="" value="0"/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2, "Use the assigned scale rather than inventing a 1–5 scale");
  assert(html.includes("Not answered"));
  assert(html.includes("Clear examples"));
  assert(html.includes("Observer acknowledgement"));
  assert(html.includes("UTC"));
  assert(html.includes("&lt;script&gt;"));
  assert.doesNotMatch(html, /<script|<form|<button|type="submit"|<textarea/);
});

test("tracking details preserve progress order and distinguish scheduled from proposed meeting times", () => {
  const meeting = { id: "scheduled", sectionId: "section", date: "2026-06-30", startsAt: "2026-07-01T01:00:00Z",
    endsAt: "2026-07-01T02:00:00Z", timeZone: "America/Chicago", location: "Room 101" };
  const detail = { observation: { id: "observation", scheduledMeeting: meeting },
    progress: [{ key: "first", label: "Signed up", state: "complete", completedAt: "2026-06-01T12:00:00Z" },
      { key: "second", label: "Observation underway", state: "in-progress", completedAt: null }],
    proposedMeetings: [{ ...meeting, id: "proposed", available: false, reason: "Room unavailable" }] };
  const html = renderToStaticMarkup(createElement(ObservationTrackingDetails, { detail }));
  const localTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: meeting.timeZone }).format(new Date(meeting.startsAt));
  assert(html.includes(localTime), "Meeting time must use its supplied zone, including the previous local calendar day");
  assert(html.includes("America/Chicago"));
  assert(html.includes("Room 101"));
  assert(html.includes("Scheduled observation"));
  assert(html.includes("Proposed meeting options"));
  assert(html.includes("not a confirmed observation appointment"));
  assert(html.indexOf("Signed up") < html.indexOf("Observation underway"));
  assert(html.includes("in-progress"));
  assert(html.includes("Completion date not recorded"));
  assert(html.includes("Unavailable"));
  assert(html.includes("Room unavailable"));
  assert.doesNotMatch(html, /<form|<button|<input|<textarea/);
});

test("tracking details handle absent records and invalid timestamps/time zones without crashing", () => {
  const empty = renderToStaticMarkup(createElement(ObservationTrackingDetails, {
    detail: { observation: { id: "observation", scheduledMeeting: null }, progress: [], proposedMeetings: [] },
  }));
  assert(empty.includes("No observation meeting is scheduled."));
  assert(empty.includes("No progress information is available."));
  assert(empty.includes("No proposed meeting information is available."));
  const invalid = renderToStaticMarkup(createElement(ObservationTrackingDetails, {
    detail: { observation: { id: "observation", scheduledMeeting: { id: "meeting", startsAt: "invalid", endsAt: "2026-07-01T02:00:00Z", timeZone: "not/a-zone" } } },
  }));
  assert(invalid.includes("Times are shown in UTC."));
  assert(invalid.includes("Not provided"));
  assert.doesNotMatch(invalid, /Invalid Date|NaN/);
});
