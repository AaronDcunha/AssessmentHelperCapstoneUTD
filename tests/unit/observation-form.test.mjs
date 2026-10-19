import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(
  new URL("../../src/lib/observation-form.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { parseSubmittedObservationForm: parse } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);
function resources() {
  return {
    template: {
      templateId: "t1",
      templateName: "Teaching observation",
      criteria: [
        { criterionId: "q2", templateId: "t1", criterionText: "Comments", displayOrder: 2 },
        { criterionId: "q1", templateId: "t1", criterionText: "First question", displayOrder: 1 },
      ],
    },
    assessment: {
      observationId: "o1",
      templateId: "t1",
      assessment: {
        observationId: "o1",
        templateId: "t1",
        responses: { q1: 4, q2: "Recorded comment" },
        isLocked: true,
        observerSignedAt: "2026-10-18T11:00:00Z",
        observeeSignedAt: "2026-10-18T12:00:00Z",
        completedAt: "2026-10-18T12:00:00Z",
      },
    },
  };
}
test("Haris fields determine displayed answers and current criterion order without mutating inputs", () => {
  const input = resources(),
    before = structuredClone(input);
  assert.deepEqual(
    parse("o1", input).questions.map(({ id, answer }) => ({ id, answer })),
    [
      { id: "q1", answer: "4" },
      { id: "q2", answer: "Recorded comment" },
    ],
  );
  assert.deepEqual(input, before);
  input.template.criteria[1].criterionText = "Edited current template question";
  assert.equal(parse("o1", input).questions[0].prompt, "Edited current template question");
});
test("another observation/template/criterion cannot be displayed", () => {
  assert.throws(() => parse("other", resources()));
  for (const edit of [
    (r) => (r.assessment.templateId = "other"),
    (r) => (r.assessment.assessment.templateId = "other"),
    (r) => (r.template.templateId = "other"),
    (r) => (r.template.criteria[0].templateId = "other"),
  ]) {
    const input = resources();
    edit(input);
    assert.throws(() => parse("o1", input));
  }
});
test("absent/unlocked/incomplete records are not labeled completed", () => {
  const input = resources();
  input.assessment.assessment.isLocked = false;
  assert.equal(parse("o1", input), null);
  input.assessment.assessment.isLocked = true;
  input.assessment.assessment.completedAt = null;
  assert.equal(parse("o1", input), null);
  input.assessment.assessment = null;
  assert.equal(parse("o1", input), null);
});
test("unknown JSON layouts, bad signatures, duplicate criteria and answers fail closed", () => {
  for (const edit of [
    (r) => (r.assessment.assessment.responses = [{ criterionId: "q1", value: 4 }]),
    (r) => (r.assessment.assessment.responses.unknown = 1),
    (r) => (r.assessment.assessment.responses.q1 = {}),
    (r) => (r.assessment.assessment.observerSignedAt = null),
    (r) => r.template.criteria.push({ ...r.template.criteria[0] }),
  ]) {
    const input = resources();
    edit(input);
    assert.throws(() => parse("o1", input));
  }
});
test("missing answers remain missing without fabricated scores or labels", () => {
  const input = resources();
  input.assessment.assessment.responses = {};
  assert.ok(parse("o1", input).questions.every(({ answer }) => answer === "No answer recorded"));
});
