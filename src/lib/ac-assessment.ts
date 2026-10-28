import { acApi, ApiRequestError } from "./ac-api";

// The backend decides record/draft visibility. Never fall back to the global
// current template, which could attach different questions to historical answers.
export async function loadObservationAssessment(observationId: string) {
  const response = await acApi.getObservationAssessment(observationId);
  if (response.observationId !== observationId || response.assessment && response.assessment.observationId !== observationId) {
    throw new ApiRequestError("The assessment response belongs to a different observation.");
  }
  if (!response.assessment) return null;
  const template = await acApi.getObservationTemplate(observationId);
  const assignedIds = [response.templateVersionId, response.assessment.templateVersionId];
  if (assignedIds.some(id => id && id !== template.id)) throw new ApiRequestError("The assessment and assigned template do not match.");
  return { assessment: response.assessment, template };
}

export function assessmentDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date)} UTC`
    : "—";
}
