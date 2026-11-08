import type { Prisma } from "../generated/prisma/client";

export type TemplateSnapshot = {
  id: string; title: string; description: string | null; revision: number;
  criteria: Array<{ id: string; key: string; prompt: string; type: string; required: boolean; order: number; weight: number; options?: unknown }>;
  commentPrompts: unknown; signatureLabels: unknown;
};

export type SnapshotSource = {
  templateId: string; templateName: string; description: string | null; revision: number;
  commentPrompts: Prisma.JsonValue; signatureLabels: Prisma.JsonValue;
  criteria: Array<{ criterionId: string; criterionKey: string; criterionText: string; questionType: string; isRequired: boolean; displayOrder: number; weight: number; options: Prisma.JsonValue | null }>;
};

export function createTemplateSnapshot(template: SnapshotSource): TemplateSnapshot {
  return { id: template.templateId, title: template.templateName, description: template.description, revision: template.revision,
    criteria: template.criteria.map(c => ({ id: c.criterionId, key: c.criterionKey, prompt: c.criterionText, type: c.questionType,
      required: c.isRequired, order: c.displayOrder, weight: c.weight, ...(c.options === null ? {} : { options: c.options }) })),
    commentPrompts: template.commentPrompts, signatureLabels: template.signatureLabels };
}

export function readTemplateSnapshot(value: Prisma.JsonValue | null): TemplateSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, Prisma.JsonValue>;
  if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.revision !== "number" || !Array.isArray(item.criteria)) return null;
  const criteria = item.criteria.flatMap(raw => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const c = raw as Record<string, Prisma.JsonValue>;
    return typeof c.id === "string" && typeof c.key === "string" && typeof c.prompt === "string" && typeof c.type === "string"
      && typeof c.required === "boolean" && typeof c.order === "number" && typeof c.weight === "number"
      ? [{ id: c.id, key: c.key, prompt: c.prompt, type: c.type, required: c.required, order: c.order, weight: c.weight, ...(c.options === undefined ? {} : { options: c.options }) }] : [];
  });
  if (criteria.length !== item.criteria.length) return null;
  return { id: item.id, title: item.title, description: typeof item.description === "string" ? item.description : null, revision: item.revision,
    criteria, commentPrompts: item.commentPrompts ?? [], signatureLabels: item.signatureLabels ?? { observer: "Observer", observee: "Observee" } };
}
