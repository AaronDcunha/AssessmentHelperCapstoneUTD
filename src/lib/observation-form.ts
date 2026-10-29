/** Read-only adapter for the existing observation assessment/template endpoints. */
export interface SubmittedObservationForm {
  title: string;
  completedAt: string | null;
  questions: { id: string; prompt: string; answer: string }[];
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid form response.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid form field.");
  return value;
}
function list(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error("Invalid form list.");
  return value.map(object);
}
export function parseSubmittedObservationForm(
  observationId: string,
  resources: { assessment: unknown; template: unknown },
): SubmittedObservationForm | null {
  const envelope = object(resources.assessment);
  if (envelope.observationId !== observationId) throw new Error("Mismatched observation.");
  if (envelope.assessment === null) return null;
  const assessment = object(envelope.assessment), template = object(resources.template);
  if (assessment.observationId !== observationId || text(assessment.templateVersionId) !== text(template.id)
    || envelope.templateVersionId !== template.id) throw new Error("Mismatched template.");
  // History displays finalized forms only; draft/submitted reads remain in the active workflow.
  if (assessment.status === "draft" || assessment.status === "submitted") return null;
  if (assessment.status !== "locked") throw new Error("Unsupported assessment status.");
  const completedAt = assessment.submittedAt === null ? null : text(assessment.submittedAt);
  if (completedAt !== null && !Number.isFinite(Date.parse(completedAt))) throw new Error("Invalid submission date.");
  const criteria = list(template.criteria), ids = new Set<string>(), orders = new Set<number>();
  for (const criterion of criteria) {
    const id = text(criterion.id);
    text(criterion.prompt);
    if (ids.has(id) || !Number.isInteger(criterion.order) || orders.has(criterion.order as number)) throw new Error("Invalid form criterion.");
    ids.add(id); orders.add(criterion.order as number);
  }
  const answers = new Map<string, string>();
  for (const answer of list(assessment.answers)) {
    const id = text(answer.criterionId), value = answer.value;
    if (!ids.has(id) || answers.has(id) || !(value === null || typeof value === "string" || typeof value === "number" && Number.isFinite(value))) throw new Error("Invalid answer.");
    answers.set(id, value === null || value === "" ? "No answer recorded" : String(value));
  }
  const questions = [...criteria].sort((a,b) => (a.order as number) - (b.order as number)).map(c => ({
    id: text(c.id), prompt: text(c.prompt), answer: answers.get(text(c.id)) ?? "No answer recorded",
  }));
  const prompts = list(template.commentPrompts), comments = new Map<string, string>();
  const promptIds = new Set(prompts.map(p => text(p.id)));
  if (promptIds.size !== prompts.length) throw new Error("Duplicate comment prompt.");
  for (const comment of list(assessment.comments)) {
    const id = text(comment.promptId);
    if (!promptIds.has(id) || comments.has(id) || typeof comment.text !== "string") throw new Error("Invalid comment.");
    comments.set(id, comment.text);
  }
  for (const prompt of [...prompts].sort((a,b) => (a.order as number) - (b.order as number))) {
    const id = text(prompt.id);
    questions.push({ id: `comment:${id}`, prompt: text(prompt.prompt), answer: comments.get(id)?.trim() || "No answer recorded" });
  }
  if (assessment.generalComments != null) {
    if (typeof assessment.generalComments !== "string") throw new Error("Invalid general comments.");
    if (assessment.generalComments.trim()) questions.push({ id: "general-comments", prompt: "Additional comments", answer: assessment.generalComments });
  }
  return { title: text(template.title), completedAt, questions };
}
