import assert from "node:assert/strict";
import test from "node:test";
import { nextTemplateSection, previousTemplateSection, TEMPLATE_SECTIONS } from "../../src/lib/ac-template-sections.ts";

test("template section navigation moves forward and backward without leaving its bounds", () => {
  assert.deepEqual(TEMPLATE_SECTIONS, ["scale", "long-responses", "comments-signatures"]);
  assert.equal(nextTemplateSection("scale"), "long-responses");
  assert.equal(nextTemplateSection("long-responses"), "comments-signatures");
  assert.equal(nextTemplateSection("comments-signatures"), "comments-signatures");
  assert.equal(previousTemplateSection("comments-signatures"), "long-responses");
  assert.equal(previousTemplateSection("long-responses"), "scale");
  assert.equal(previousTemplateSection("scale"), "scale");
});
