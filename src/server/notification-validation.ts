import { ConfigurationError, type ConfigurationUser } from "./configuration-validation";
export const notificationError = (status: number, code: string, message: string): never => { throw new ConfigurationError(status, code, message); };
export function notificationGrant(user: ConfigurationUser, write = false) {
  if (!user.permissions.includes("notifications.read.own") || write && !user.permissions.includes("notifications.update.own")) notificationError(403, "FORBIDDEN", "Permission denied.");
}
export function notificationId(value: unknown): string {
  if (typeof value !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)) notificationError(400, "INVALID_REQUEST", "Expected a valid record ID.");
  return (value as string).toLowerCase();
}
export function notificationBody(value: unknown, read: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) notificationError(400, "INVALID_REQUEST", "Expected a JSON object.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !read || key !== "read") || read && typeof body.read !== "boolean") notificationError(400, "INVALID_REQUEST", read ? "Provide only read:boolean." : "Provide an empty object.");
  return body;
}
export function notificationQuery(params: URLSearchParams, list: boolean) {
  const allowed = list ? ["read", "cursor", "limit", "after"] : [];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length !== 1 || !params.get(key)?.trim()) notificationError(400, "INVALID_QUERY", "Invalid notification query.");
  const read = params.get("read") ?? "all", limit = params.get("limit") ?? "20";
  if (!["all", "unread"].includes(read) || !/^\d+$/.test(limit) || +limit < 1 || +limit > 100) notificationError(400, "INVALID_QUERY", "Use read=all|unread and limit between 1 and 100.");
  return { read, limit: +limit, cursor: params.get("cursor"), after: params.get("after") };
}
export const notificationToken = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
export function parseNotificationToken(raw: string) {
  try {
    if (raw.length > 2048 || !/^[\w-]+$/.test(raw)) throw new Error();
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { return notificationError(400, "INVALID_CURSOR", "Invalid notification cursor."); }
}
export function tokenDate(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value))) notificationError(400, "INVALID_CURSOR", "Invalid notification cursor.");
  return new Date(value as string);
}
