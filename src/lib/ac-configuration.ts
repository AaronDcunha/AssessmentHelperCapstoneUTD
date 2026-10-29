import { ApiRequestError, type Cycle, type ObservationTemplate, type ObservationTemplateWrite, type TemplateCriterion, type TemplateComment } from "./ac-api";
import { parseCalendarDate } from "./calendar-date";

export const deadlineKeys = ["signupDeadline", "observationDeadline", "feedbackDeadline"] as const;
export type Deadlines = Record<typeof deadlineKeys[number], string>;

export function configurationError(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return error instanceof TypeError ? "Could not connect. Check your connection and retry; your edits are preserved." : error instanceof Error ? error.message : "The request failed. Please retry.";
  const prefix: Record<number, string> = {
    401: "Your session has expired. Sign in again before retrying.",
    403: "You do not have permission for this action.",
    404: "This configuration is no longer available. Reload the list to choose another record.",
    409: "The change could not be saved. This may be a duplicate, a stale revision, or a referenced-question restriction. Your edits are preserved; review the message before reloading.",
    422: "Check the entered fields.",
  };
  if (error.status && error.status >= 500) return "The server could not complete the request. Please retry; your edits are preserved.";
  return [prefix[error.status ?? 0], error.status && error.status < 500 && !error.message.startsWith("Request failed with status") ? error.message : undefined].filter(Boolean).join(" ") || "The request failed. Please retry.";
}

function localParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const get = (part: string) => parts.find(item => item.type === part)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}
export function deadlineInput(iso: string | null | undefined, timeZone: string) {
  return iso ? localParts(new Date(iso), timeZone) : "";
}
export function validDateOnly(value: string) {
  return !!parseCalendarDate(value);
}
/** Convert a wall clock in the semester zone. Reject gaps/folds instead of silently
 * moving the cutoff. Unedited inputs retain the exact original instant (including ms).
 */
export function deadlineUtc(value: string, timeZone: string, original?: string | null) {
  if (original && value === deadlineInput(original, timeZone)) return original;
  const wall = value.length === 16 ? `${value}:00` : value;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(wall) || !validDateOnly(wall.slice(0, 10)) || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(wall.slice(11))) throw new Error("Enter a valid deadline date and time.");
  const guess = Date.parse(`${wall}Z`);
  const offsets = new Set<number>();
  for (const hours of [-36, 0, 36]) {
    const instant = new Date(guess + hours * 3600000);
    offsets.add(Date.parse(`${localParts(instant, timeZone)}Z`) - instant.getTime());
  }
  const matches = [...offsets].map(offset => new Date(guess - offset)).filter(instant => localParts(instant, timeZone) === wall);
  if (matches.length !== 1) throw new Error("This local time is missing or repeated at a daylight-saving change. Choose an unambiguous deadline time.");
  return matches[0].toISOString();
}
export function cycleDeadlines(cycle: Cycle): Deadlines {
  const zone = cycle.semester?.timeZone;
  if (!zone) throw new Error("The semester time zone is missing. Configuration cannot be edited safely.");
  return Object.fromEntries(deadlineKeys.map(key => [key, deadlineInput(cycle[key], zone)])) as Deadlines;
}
export function deadlinePayload(form: Deadlines, timeZone: string, original?: Cycle): Deadlines {
  const result = Object.fromEntries(deadlineKeys.map(key => [key, deadlineUtc(form[key], timeZone, original?.[key])])) as Deadlines;
  if (!(Date.parse(result.signupDeadline) < Date.parse(result.observationDeadline) && Date.parse(result.observationDeadline) < Date.parse(result.feedbackDeadline))) throw new Error("Deadlines must be ordered: signup before observation before feedback.");
  return result;
}
export function deadlineDisplay(iso: string | null | undefined, timeZone?: string) {
  if (!iso) return "Not set";
  try { return new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)); }
  catch { return "Unavailable"; }
}

export type EditorCriterion = TemplateCriterion & { uiId: string };
export type EditorComment = TemplateComment & { uiId: string };
export type TemplateDraft = { title: string; criteria: EditorCriterion[]; commentPrompts: EditorComment[]; signatureLabels: { observer: string; observee: string } };
export const newTemplate = (): TemplateDraft => ({ title: "Faculty observation form", criteria: [], commentPrompts: [], signatureLabels: { observer: "Observer signature", observee: "Faculty signature" } });
export function templateDraft(template: ObservationTemplate): TemplateDraft {
  return { title: template.title, criteria: [...template.criteria].sort((a, b) => a.order - b.order).map(item => ({ ...item, options: item.options?.map(option => ({ ...option })), uiId: item.id ?? `criterion-${item.key}` })),
    commentPrompts: [...template.commentPrompts].sort((a, b) => a.order - b.order).map((item, index) => ({ ...item, uiId: item.id ?? `comment-${index}` })), signatureLabels: { ...template.signatureLabels } };
}
export function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  if (index + direction < 0 || index + direction >= items.length) return items;
  const result = [...items];
  [result[index], result[index + direction]] = [result[index + direction], result[index]];
  return result;
}
export function moveQuestion(items: EditorCriterion[], uiId: string, direction: -1 | 1) {
  const index = items.findIndex(item => item.uiId === uiId);
  if (index < 0) return items;
  const peers = items.map((item, at) => item.type === items[index].type ? at : -1).filter(at => at >= 0);
  const target = peers[peers.indexOf(index) + direction];
  if (target === undefined) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
}
export function templatePayload(draft: TemplateDraft): ObservationTemplateWrite {
  const text = (value: string, name: string) => { if (!value.trim() || value.length > 2000) throw new Error(`${name} must contain 1–2000 characters.`); return value; };
  text(draft.title, "Template title");
  if (!draft.criteria.length || draft.criteria.length > 100) throw new Error("Add between 1 and 100 questions before saving.");
  if (draft.commentPrompts.length > 100) throw new Error("Use at most 100 comment prompts.");
  const criteria = draft.criteria.map((item, order) => {
    text(item.prompt, `Question ${order + 1}`); text(item.key, "Question key");
    if (!Number.isFinite(item.weight ?? 1) || (item.weight ?? 1) < 0) throw new Error("Question weights must be finite and nonnegative.");
    if (item.type === "rating" && (!item.options || item.options.length < 2 || item.options.length > 20 || new Set(item.options.map(option => option.value)).size !== item.options.length || item.options.some(option => !Number.isInteger(option.value) || option.value < -2147483648 || option.value > 2147483647 || !option.label.trim() || option.label.length > 2000))) throw new Error(`Question ${order + 1} needs 2–20 distinct integer ratings with labels.`);
    return { ...(item.id ? { id: item.id } : {}), key: item.key, prompt: item.prompt, type: item.type, required: item.required, order, weight: item.weight ?? 1, ...(item.type === "rating" ? { options: item.options!.map(option => ({ ...option })) } : {}) };
  });
  if (new Set(criteria.map(item => item.key)).size !== criteria.length) throw new Error("Question keys must be unique.");
  return { title: draft.title, criteria, commentPrompts: draft.commentPrompts.map((item, order) => ({ ...(item.id ? { id: item.id } : {}), prompt: text(item.prompt, "Comment prompt"), required: item.required, order })), signatureLabels: { observer: text(draft.signatureLabels.observer, "Observer signature label"), observee: text(draft.signatureLabels.observee, "Observee signature label") } };
}
