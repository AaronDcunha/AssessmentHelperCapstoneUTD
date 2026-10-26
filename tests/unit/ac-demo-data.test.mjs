import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_ATTENTION_ITEMS,
  DEMO_EXECUTIVE_SUMMARIES,
  DEMO_FACULTY_STATUSES,
  DEMO_METRICS,
  DEMO_OBSERVATIONS,
  DEMO_REPORT,
  demoFacultyStatuses,
  demoObservations,
  isDemoRecord,
} from "../../src/lib/ac-demo-data.ts";

test("AC presentation fixtures are explicitly marked as demo records", () => {
  for (const item of [...DEMO_FACULTY_STATUSES, ...DEMO_OBSERVATIONS, ...DEMO_ATTENTION_ITEMS]) {
    assert.equal(isDemoRecord(item), true);
  }
  assert.ok(DEMO_EXECUTIVE_SUMMARIES.length >= 3);
});

test("faculty demo fixtures cover due and overdue filters", () => {
  assert.equal(DEMO_FACULTY_STATUSES.length, 6);
  assert.ok(demoFacultyStatuses("all", "due").length > 0);
  assert.ok(demoFacultyStatuses("all", "overdue").length > 0);
  assert.ok(demoFacultyStatuses("demo-assistant-professor", "overdue").every((item) => item.evaluationStatus === "overdue"));
});

test("observation demo fixtures cover every displayed progress status", () => {
  assert.equal(DEMO_OBSERVATIONS.length, 6);
  for (const status of ["in-progress", "complete", "incomplete", "unmatched"]) {
    const filtered = demoObservations(status);
    assert.ok(filtered.length > 0, `${status} needs at least one demo row`);
    assert.ok(filtered.every((item) => item.status === status));
  }
});

test("dashboard and KPI demo cards are derived from the corresponding demo rows", () => {
  assert.equal(DEMO_REPORT.summary.facultyDue, DEMO_FACULTY_STATUSES.filter((item) => item.evaluationStatus === "due").length);
  assert.equal(DEMO_REPORT.summary.overdue, DEMO_FACULTY_STATUSES.filter((item) => item.evaluationStatus === "overdue").length);
  assert.equal(DEMO_REPORT.summary.unmatched, DEMO_OBSERVATIONS.filter((item) => item.status === "unmatched").length);
  assert.equal(DEMO_REPORT.summary.incomplete, DEMO_OBSERVATIONS.filter((item) => item.status === "incomplete").length);

  const metric = (key) => DEMO_METRICS.metrics.find((item) => item.key === key)?.value;
  const percent = (count) => Math.round(count / DEMO_OBSERVATIONS.length * 100);
  assert.equal(metric("participationRate"), percent(DEMO_OBSERVATIONS.filter((item) => item.status === "complete").length));
  assert.equal(metric("observerUtilizationRate"), percent(DEMO_OBSERVATIONS.filter((item) => item.observer != null).length));
  assert.equal(metric("listSufficiencyRate"), percent(DEMO_OBSERVATIONS.filter((item) => item.observer != null).length));
  assert.equal(metric("incompleteObservations"), DEMO_OBSERVATIONS.filter((item) => item.status === "incomplete").length);
});
