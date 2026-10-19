/** Haris PR #49 read adapter: SignedAssessment.templateId/responses and
 * ObservationTemplate.criteria. Current template text may change in place.
 * The schema's Json column does not define its internal structure. This reader
 * supports an explicit local convention: { [criterionId]: number|string|null }.
 * Confirm that convention with the form writer before integrating real answers.
 */
export interface SubmittedObservationForm {
  title: string;
  completedAt: string;
  questions: { id: string; prompt: string; answer: string }[];
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid form response.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid form response.");
  return value;
}
function date(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error("Invalid completion date.");
  return result;
}

export function parseSubmittedObservationForm(
  observationId: string,
  resources: { assessment: unknown; template: unknown },
): SubmittedObservationForm | null {
  const envelope = object(resources.assessment);
  if (envelope.observationId !== observationId) throw new Error("Mismatched observation.");
  if (envelope.assessment === null) return null;
  const assessment = object(envelope.assessment),
    template = object(resources.template);
  if (
    assessment.observationId !== observationId ||
    text(assessment.templateId) !== text(template.templateId) ||
    envelope.templateId !== assessment.templateId
  )
    throw new Error("Mismatched template.");
  // Only completed, locked records appear as completed assessments.
  if (assessment.isLocked === false || assessment.completedAt === null) return null;
  if (assessment.isLocked !== true) throw new Error("Invalid assessment lock state.");
  const completedAt = date(assessment.completedAt);
  date(assessment.observerSignedAt);
  date(assessment.observeeSignedAt);
  if (!Array.isArray(template.criteria)) throw new Error("Invalid form criteria.");
  const criteria = template.criteria.map(object);
  const ids = new Set<string>(),
    orders = new Set<number>();
  for (const criterion of criteria) {
    const id = text(criterion.criterionId);
    if (
      criterion.templateId !== assessment.templateId ||
      ids.has(id) ||
      !Number.isInteger(criterion.displayOrder) ||
      orders.has(criterion.displayOrder as number)
    )
      throw new Error("Invalid form criterion.");
    text(criterion.criterionText);
    ids.add(id);
    orders.add(criterion.displayOrder as number);
  }
  const responses = object(assessment.responses);
  for (const [id, answer] of Object.entries(responses)) {
    if (
      !ids.has(id) ||
      !(
        answer === null ||
        typeof answer === "string" ||
        (typeof answer === "number" && Number.isFinite(answer))
      )
    )
      throw new Error("Unsupported assessment responses.");
  }
  return {
    title: text(template.templateName),
    completedAt,
    questions: [...criteria]
      .sort((a, b) => (a.displayOrder as number) - (b.displayOrder as number))
      .map((criterion) => {
        const id = text(criterion.criterionId),
          value = responses[id];
        return {
          id,
          prompt: text(criterion.criterionText),
          answer:
            value === undefined || value === null || value === ""
              ? "No answer recorded"
              : String(value),
        };
      }),
  };
}
