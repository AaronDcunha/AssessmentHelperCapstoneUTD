export type NotificationItem = {
  id: string; type: string; title: string; message: string; createdAt: string; readAt: string | null;
  target: { kind: string; id: string } | null;
};
export type NotificationPage = {
  items: NotificationItem[]; pageInfo: { hasMore: boolean; nextCursor: string | null };
  unreadCount: number; latestCursor: string | null;
};
export type ReadFilter = "all" | "unread";
export class NotificationRequestError extends Error {
  readonly status?: number;
  readonly uncertain: boolean;
  constructor(message: string, status?: number, uncertain = false) {
    super(message); this.status = status; this.uncertain = uncertain;
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid notification response.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid notification field.");
  return value;
}
function timestamp(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error("Invalid notification timestamp.");
  return result;
}
function pathId(value: string): string {
  const id = text(value);
  if (id === "." || id === "..") throw new Error("Invalid notification ID.");
  return encodeURIComponent(id);
}
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("Invalid unread count.");
  return value as number;
}
function cursor(value: unknown): string | null { return value === null ? null : text(value); }
export function parseNotification(value: unknown): NotificationItem {
  const n = record(value), target = n.target === null ? null : record(n.target);
  if (typeof n.message !== "string") throw new Error("Invalid notification message.");
  return { id: text(n.id), type: text(n.type), title: text(n.title), message: n.message,
    createdAt: timestamp(n.createdAt), readAt: n.readAt === null ? null : timestamp(n.readAt),
    target: target ? { kind: text(target.kind), id: text(target.id) } : null };
}
export function parseNotificationPage(value: unknown): NotificationPage {
  const data = record(value), info = record(data.pageInfo);
  if (!Array.isArray(data.items) || typeof info.hasMore !== "boolean") throw new Error("Invalid notification list.");
  const items = data.items.map(parseNotification), nextCursor = cursor(info.nextCursor);
  if (new Set(items.map(item => item.id)).size !== items.length || (info.hasMore ? !nextCursor || !items.length : nextCursor !== null)) throw new Error("Invalid notification pagination.");
  return { items, pageInfo: { hasMore: info.hasMore, nextCursor }, unreadCount: count(data.unreadCount), latestCursor: cursor(data.latestCursor) };
}
function failure(status: number): string {
  return status === 401 ? "Sign in to view your notifications." : status === 403 ? "You do not have permission to access these notifications."
    : status === 404 || status === 503 ? "Notifications are currently unavailable. Please try again later."
    : "The notification request could not be completed. Please try again.";
}
async function request<T>(path: string, parse: (value: unknown) => T, init: RequestInit = {}): Promise<T> {
  const mutation = init.method === "PATCH" || init.method === "POST";
  try {
    const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json", ...(mutation ? { "Content-Type": "application/json" } : {}) } });
    if (!response.ok) throw new NotificationRequestError(failure(response.status), response.status, mutation && response.status >= 500);
    return parse(await response.json());
  } catch (error) {
    if (init.signal?.aborted || error instanceof NotificationRequestError) throw error;
    throw new NotificationRequestError(mutation ? "The change could not be confirmed. Refresh notifications before trying another change."
      : "Notifications could not be loaded. Please try again.", undefined, mutation);
  }
}
export const notificationsApi = {
  list: (read: ReadFilter, afterCursor?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ read, limit: "20" });
    if (afterCursor) params.set("cursor", afterCursor);
    return request(`/api/notifications?${params}`, parseNotificationPage, { signal });
  },
  unreadCount: (signal?: AbortSignal) => request("/api/notifications/unread-count", value => {
    const data = record(value); return { unreadCount: count(data.unreadCount), asOf: timestamp(data.asOf) };
  }, { signal }),
  setRead: (id: string, read: boolean) => request(`/api/notifications/${pathId(id)}`, value => {
    const item = parseNotification(value);
    if (item.id !== id || (item.readAt !== null) !== read) throw new Error("Mismatched notification update.");
    return item;
  }, { method: "PATCH", body: JSON.stringify({ read }) }),
  markAllRead: () => request("/api/notifications/mark-all-read", value => {
    const data = record(value); return { updatedCount: count(data.updatedCount), cutoff: timestamp(data.cutoff), unreadCount: count(data.unreadCount) };
  }, { method: "POST", body: "{}" }),
};

/** Only approved existing internal record destinations; never trust an API-supplied URL. */
export function notificationDestination(target: NotificationItem["target"], permissions: readonly string[]): string | null {
  if (target?.kind === "observation" && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(target.id)
    && permissions.includes("observations.read.own")) return `/observations/details?observationId=${encodeURIComponent(target.id)}`;
  return null;
}
export function notifyNotificationChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("notifications:changed"));
}
