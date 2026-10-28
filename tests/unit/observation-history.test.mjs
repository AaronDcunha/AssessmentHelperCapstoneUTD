import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../../src/lib/observation-history.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { filterObservationHistory, sortObservationHistory, historySemesterYears } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);
const records = [
  { id: "a", semester: "Fall 2026", participation: "observee", statusLabel: "Completed" },
  { id: "b", semester: "Spring 2026", participation: "observer", statusLabel: "Completed" },
];
const none = { semester: "", participation: "", statusLabel: "" };

test("all filters preserve both participation roles and the supplied ordering", () => {
  assert.deepEqual(filterObservationHistory(records, none), records);
});

const searchable = [
  {
    id: "a",
    semester: "Fall 2026",
    participation: "observee",
    statusLabel: "Completed",
    courseSection: "CS 4485.001",
    otherProfessor: "Professor A",
  },
  {
    id: "b",
    semester: "Spring 2026",
    participation: "observer",
    statusLabel: "Completed",
    courseSection: "CS 3345.002",
    otherProfessor: "Professor B",
  },
  {
    id: "c",
    semester: "Summer 2025",
    participation: "observer",
    statusLabel: "Incomplete",
    courseSection: "CS 2336.003",
    otherProfessor: "Professor C",
  },
];
test("search is trimmed, case insensitive, and combines with role/status/semester selections", () => {
  assert.deepEqual(
    filterObservationHistory(searchable, { ...none, search: "  PROFESSOR b " }).map(
      (row) => row.id,
    ),
    ["b"],
  );
  assert.deepEqual(
    filterObservationHistory(searchable, {
      ...none,
      search: "3345.002",
      semesters: ["Spring 2026", "Fall 2026"],
      participation: "observer",
      statusLabel: "Completed",
    }).map((row) => row.id),
    ["b"],
  );
  assert.deepEqual(
    filterObservationHistory(searchable, { ...none, search: "3345", semesters: ["Fall 2026"] }),
    [],
  );
  assert.deepEqual(
    filterObservationHistory(searchable, { ...none, search: "   ", semesters: [] }),
    searchable,
  );
});
test("semester sorting is chronological across terms and years, in both directions", () => {
  assert.deepEqual(
    sortObservationHistory(searchable, { key: "semester", direction: "desc" }).map((row) => row.id),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    sortObservationHistory(searchable, { key: "semester", direction: "asc" }).map((row) => row.id),
    ["c", "b", "a"],
  );
  assert.deepEqual(
    searchable.map((row) => row.id),
    ["a", "b", "c"],
  );
});
test("all table sort columns work without mutating their input", () => {
  const frozen = Object.freeze(searchable.map((row) => Object.freeze({ ...row })));
  for (const key of ["courseSection", "participation", "otherProfessor", "statusLabel"]) {
    const result = sortObservationHistory(frozen, { key, direction: "asc" });
    assert.equal(result.length, frozen.length);
    for (let i = 1; i < result.length; i++)
      assert.ok(
        result[i - 1][key].localeCompare(result[i][key], undefined, {
          numeric: true,
          sensitivity: "base",
        }) <= 0,
      );
  }
});
test("semester grid years come only from history, newest first", () => {
  assert.deepEqual(historySemesterYears(searchable), [2026, 2025]);
  assert.deepEqual(historySemesterYears([]), []);
  assert.deepEqual(historySemesterYears([{ semester: "Unspecified" }]), []);
});
test("semester and role filters combine instead of showing another participation", () => {
  assert.deepEqual(
    filterObservationHistory(records, {
      ...none,
      semester: "Fall 2026",
      participation: "observer",
    }),
    [],
  );
  assert.deepEqual(
    filterObservationHistory(records, {
      ...none,
      participation: "observer",
      statusLabel: "Completed",
    }).map((record) => record.id),
    ["b"],
  );
});
test("empty history remains empty and filtering does not mutate source records", () => {
  const frozen = Object.freeze(records.map((record) => Object.freeze({ ...record })));
  assert.deepEqual(filterObservationHistory([], none), []);
  assert.deepEqual(
    filterObservationHistory(frozen, { ...none, semester: "Fall 2026" }).map((record) => record.id),
    ["a"],
  );
  assert.deepEqual(frozen, records);
});
