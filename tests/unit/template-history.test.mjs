import "../configuration-loader.mjs";
import test from "node:test";
import assert from "node:assert/strict";

const { createTemplateSnapshot, readTemplateSnapshot } = await import("../../src/server/template-snapshot.ts");
const { unarchiveTemplate } = await import("../../src/server/services/configuration.ts");

const template = {
  templateId: "11111111-1111-4111-8111-111111111111",
  templateName: "Faculty observation",
  description: "Frozen form",
  revision: 7,
  commentPrompts: [{ id: "comment-1", prompt: "Comments", required: false, order: 0 }],
  signatureLabels: { observer: "Observer", observee: "Faculty" },
  criteria: [{ criterionId: "criterion-1", criterionKey: "preparation", criterionText: "Preparation", questionType: "RATING", isRequired: true, displayOrder: 0, weight: 1, options: [{ value: 1, label: "Needs work" }, { value: 2, label: "Meets expectations" }] }],
};

test("a template snapshot contains the complete historical form and round-trips", () => {
  const snapshot = createTemplateSnapshot(template);
  assert.deepEqual(readTemplateSnapshot(snapshot), snapshot);
  assert.equal(snapshot.criteria[0].key, "preparation");
  assert.deepEqual(snapshot.signatureLabels, template.signatureLabels);
});

test("malformed historical snapshots are rejected instead of being guessed", () => {
  assert.equal(readTemplateSnapshot(null), null);
  assert.equal(readTemplateSnapshot({ id: "template", title: "Incomplete", revision: 1, criteria: [{ id: "missing-fields" }] }), null);
});

test("safe-deletion migration grants destructive permissions separately", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../../prisma/migrations/20261106000000_ac_safe_deletion_template_history/migration.sql", import.meta.url), "utf8"));
  assert.match(source, /signups\.delete/);
  assert.match(source, /observations\.delete/);
  assert.match(source, /template_snapshot/);
  assert.match(source, /ON DELETE RESTRICT/);
});

test("unarchiving is revision checked and restores an inactive editable draft", async () => {
  const state = { revision: 5, status: "archived", isActive: false, archivedAt: new Date("2026-11-06T00:00:00Z") };
  const templateRecord = () => ({
    templateId: template.templateId, templateName: template.templateName, description: template.description,
    revision: state.revision, status: state.status, isActive: state.isActive, archivedAt: state.archivedAt,
    publishedAt: new Date("2026-11-01T00:00:00Z"), creationKey: null, creationHash: null,
    commentPrompts: template.commentPrompts, signatureLabels: template.signatureLabels,
    criteria: template.criteria.map(item => ({ templateId: template.templateId, ...item })),
  });
  const db = {
    observationTemplate: {
      findUnique: async () => ({ revision: state.revision, status: state.status }),
      updateMany: async ({ where, data }) => {
        if (where.revision !== state.revision || where.status !== state.status) return { count: 0 };
        state.status = data.status; state.isActive = data.isActive; state.archivedAt = data.archivedAt; state.revision++;
        return { count: 1 };
      },
      findFirst: async () => templateRecord(),
    },
    $transaction: async callback => callback(db),
  };
  const user = { id: "22222222-2222-4222-8222-222222222222", permissions: ["templates.manage"] };
  const restored = await unarchiveTemplate(db, user, template.templateId, { expectedRevision: 5 });
  assert.equal(restored.status, "draft");
  assert.equal(restored.revision, 6);
  assert.equal(state.isActive, false);
  assert.equal(state.archivedAt, null);
  await assert.rejects(() => unarchiveTemplate(db, user, template.templateId, { expectedRevision: 6 }), error => error.code === "INVALID_TRANSITION");
});
