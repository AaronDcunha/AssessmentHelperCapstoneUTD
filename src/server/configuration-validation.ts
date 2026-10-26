export class ConfigurationError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
export function invalid(message: string): never { throw new ConfigurationError(422, "VALIDATION_ERROR", message); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Expected a JSON object.");
  return value as Record<string, unknown>;
}
export function fields(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some(key => !allowed.includes(key))) invalid("Unknown request field.");
}
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)) invalid("Expected a UUID.");
  return value;
}
export function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 2000) invalid("Expected nonempty text of at most 2000 characters.");
  return value.trim();
}
export function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid("A nonnegative expected revision is required.");
  return value as number;
}
export function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) invalid("Deadlines must be UTC ISO timestamps.");
  date(value.slice(0,10));
  return new Date(value).toISOString();
}
export function date(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000") || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) invalid("Expected a valid YYYY-MM-DD date.");
  return value;
}
export function deadlines(body: Record<string, unknown>) {
  const result = { signupDeadline: timestamp(body.signupDeadline), observationDeadline: timestamp(body.observationDeadline), feedbackDeadline: timestamp(body.feedbackDeadline) };
  if (!(result.signupDeadline < result.observationDeadline && result.observationDeadline < result.feedbackDeadline)) invalid("Deadlines must be ordered: signup, observation, feedback.");
  return result;
}
export function pagination(url: URL) {
  const raw = url.searchParams.get("limit") ?? "20";
  if (!/^\d+$/.test(raw) || +raw < 1 || +raw > 100) invalid("limit must be between 1 and 100.");
  const cursor = url.searchParams.get("cursor");
  return { limit: +raw, cursor: cursor ? uuid(cursor) : null };
}
export function criteria(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 100) invalid("Provide between 1 and 100 criteria.");
  const keys = new Set<string>(); const orders = new Set<number>(); const ids = new Set<string>();
  return value.map(item => {
    const c = object(item); fields(c,["id","key","prompt","type","required","order","options","weight"]);
    const key = text(c.key); const prompt = text(c.prompt);
    if (keys.has(key) || orders.has(c.order as number) || !Number.isSafeInteger(c.order) || (c.order as number) < 0 || (c.order as number) > 2147483647) invalid("Criterion keys and nonnegative 32-bit orders must be unique.");
    keys.add(key); orders.add(c.order as number);
    if (c.id !== undefined) { uuid(c.id); if (ids.has(c.id as string)) invalid("Duplicate criterion ID."); ids.add(c.id as string); }
    if (!["rating","text"].includes(c.type as string) || typeof c.required !== "boolean") invalid("Criteria require rating/text type and boolean required.");
    if (c.weight !== undefined && (typeof c.weight !== "number" || !Number.isFinite(c.weight) || c.weight < 0)) invalid("Invalid criterion weight.");
    if (c.type === "rating") {
      if (!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 20) invalid("Ratings require 2–20 options.");
      const values = new Set<number>();
      for (const item of c.options) { const o = object(item); fields(o,["value","label"]); if (!Number.isSafeInteger(o.value) || (o.value as number)<-2147483648 || (o.value as number)>2147483647 || values.has(o.value as number)) invalid("Rating values must be unique 32-bit integers."); values.add(o.value as number); text(o.label); }
    } else if (c.options !== undefined) invalid("Text questions cannot have rating options.");
    return {id: c.id as string | undefined, key, prompt, type: c.type as "rating" | "text",
      required: c.required as boolean, order: c.order as number, weight: (c.weight ?? 1) as number,
      options: c.options as {value: number; label: string}[] | undefined};
  });
}
export function commentPrompts(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) invalid("commentPrompts must be an array of at most 100 prompts.");
  const ids = new Set<string>(); const orders = new Set<number>();
  return value.map(item => {
    const p = object(item); fields(p,["id","prompt","required","order"]);
    if (typeof p.required !== "boolean" || !Number.isSafeInteger(p.order) || (p.order as number) < 0 || orders.has(p.order as number)) invalid("Prompts need boolean required and unique nonnegative orders.");
    orders.add(p.order as number);
    if (p.id !== undefined) { uuid(p.id); if (ids.has(p.id as string)) invalid("Duplicate prompt ID."); ids.add(p.id as string); }
    return {id:p.id as string | undefined,prompt:text(p.prompt),required:p.required,order:p.order as number};
  });
}
export function signatureLabels(value: unknown) {
  const labels = object(value); fields(labels,["observer","observee"]);
  return {observer:text(labels.observer),observee:text(labels.observee)};
}
export function timeZone(value: unknown) {
  const zone = text(value);
  try { new Intl.DateTimeFormat("en-US",{timeZone:zone}); } catch { invalid("Invalid IANA timeZone."); }
  return zone;
}
export type ConfigurationUser = {id: string; permissions: string[]};
export function hasAnyPermission(user: ConfigurationUser | null, permissions: string[]) {
  return !!user && permissions.some(permission => user.permissions.includes(permission));
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Browser mutations must supply an exact origin. Do not trust forwarded-host headers.
  return !!origin && origin === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site";
}
