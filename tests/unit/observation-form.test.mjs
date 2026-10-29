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
    template: { id: "t1", title: "Teaching observation", criteria: [
      { id: "q2", prompt: "Comments", order: 2 }, { id: "q1", prompt: "First question", order: 1 },
    ], commentPrompts: [{ id: "p1", prompt: "Strengths", order: 1 }] },
    assessment: { observationId: "o1", templateVersionId: "t1", assessment: {
      observationId: "o1", templateVersionId: "t1", status: "locked", submittedAt: null,
      answers: [{ criterionId: "q1", value: 0 }, { criterionId: "q2", value: "Recorded comment" }],
      comments: [{ promptId: "p1", text: "Clear explanations" }], generalComments: "Additional context",
    } },
  };
}
test("current endpoint shapes preserve ordered answers, zero ratings, and comments without invented timestamps", () => {
  const input = resources(), before = structuredClone(input), result = parse("o1", input);
  assert.equal(result.title, "Teaching observation");
  assert.equal(result.completedAt, null);
  assert.deepEqual(result.questions.map(q => q.answer), ["0", "Recorded comment", "Clear explanations", "Additional context"]);
  assert.deepEqual(input, before);
});
test("another observation or assigned template cannot be displayed", () => {
  assert.throws(() => parse("other", resources()));
  for (const edit of [r => r.assessment.templateVersionId = "other", r => r.assessment.assessment.templateVersionId = "other", r => r.template.id = "other"]) {
    const input = resources(); edit(input); assert.throws(() => parse("o1", input));
  }
});
test("absent, draft and submitted forms are not presented as finalized", () => {
  for (const status of ["draft", "submitted"]) { const input = resources(); input.assessment.assessment.status = status; assert.equal(parse("o1", input), null); }
  const input = resources(); input.assessment.assessment = null; assert.equal(parse("o1", input), null);
});
test("malformed answers, duplicates, unknown criteria and invalid dates fail closed", () => {
  for (const edit of [
    r => r.assessment.assessment.answers[0].value = {},
    r => r.assessment.assessment.answers[0].criterionId = "other",
    r => r.assessment.assessment.answers.push(r.assessment.assessment.answers[0]),
    r => r.template.criteria.push(r.template.criteria[0]),
    r => r.assessment.assessment.submittedAt = "not-a-date",
    r => r.assessment.assessment.comments[0].promptId = "unknown",
    r => r.assessment.assessment.status = "unexpected",
  ]) { const input = resources(); edit(input); assert.throws(() => parse("o1", input)); }
});
test("missing answers stay missing and an actual submission date is retained", () => {
  const input = resources(); input.assessment.assessment.answers = []; input.assessment.assessment.submittedAt = "2026-10-18T12:00:00Z";
  const result = parse("o1", input); assert.equal(result.completedAt, "2026-10-18T12:00:00Z");
  assert.ok(result.questions.slice(0, 2).every(q => q.answer === "No answer recorded"));
});
