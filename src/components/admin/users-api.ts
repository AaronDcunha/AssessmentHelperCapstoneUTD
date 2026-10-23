export type UserRole = { id: string; name: string };
export type ListedUser = {
  id: string;
  name: string;
  email: string;
  accountStatus: string;
  roles: UserRole[];
};
export type PageInfo = { nextCursor: string | null; hasMore: boolean };
export type ListPage<T> = { items: T[]; pageInfo: PageInfo };
export type UserFilters = { q: string; roleId: string; accountStatus: string };
export type ApiErrorKind = "unauthorized" | "forbidden" | "unavailable" | "network" | "malformed" | "server";

export class UsersApiError extends Error {
  kind: ApiErrorKind;
  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = "UsersApiError";
    this.kind = kind;
  }
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isRole = (value: unknown): value is UserRole => object(value) && nonempty(value.id) && nonempty(value.name);
const isUser = (value: unknown): value is ListedUser => object(value)
  && nonempty(value.id) && nonempty(value.name) && typeof value.email === "string"
  && nonempty(value.accountStatus) && Array.isArray(value.roles) && value.roles.every(isRole);

function malformed() {
  return new UsersApiError("malformed", "The service returned an unexpected response. Please try again.");
}

async function readList<T>(url: string, isItem: (value: unknown) => value is T, signal: AbortSignal): Promise<ListPage<T>> {
  let response: Response;
  try {
    response = await fetch(url, { signal, credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new UsersApiError("network", "Unable to connect to the service. Check your connection and try again.");
  }
  if (response.status === 401) throw new UsersApiError("unauthorized", "Your session has expired. Sign in again to view users.");
  if (response.status === 403) throw new UsersApiError("forbidden", "You do not have permission to view these records.");
  if (response.status === 404 || response.status === 501) {
    throw new UsersApiError("unavailable", "The service is currently unavailable. Please try again later.");
  }
  if (!response.ok) throw new UsersApiError("server", "The request could not be completed. Please try again.");
  if (response.redirected || !/application\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get("content-type") ?? "")) {
    throw new UsersApiError("unavailable", "The service is currently unavailable. Please try again later.");
  }
  let data: unknown;
  try { data = await response.json(); } catch (error) {
    if (signal.aborted) throw error;
    throw malformed();
  }
  if (!object(data) || !Array.isArray(data.items) || !data.items.every(isItem) || !object(data.pageInfo)) throw malformed();
  const { nextCursor, hasMore } = data.pageInfo;
  if (typeof hasMore !== "boolean" || !(nextCursor === null || nonempty(nextCursor)) || (hasMore && !nonempty(nextCursor))) throw malformed();
  return { items: data.items, pageInfo: { nextCursor, hasMore } };
}

export function fetchUsers(filters: UserFilters, cursor: string | null, signal: AbortSignal): Promise<ListPage<ListedUser>> {
  const query = new URLSearchParams({ limit: "20" });
  if (filters.q.trim()) query.set("q", filters.q.trim());
  if (filters.roleId) query.set("roleId", filters.roleId);
  if (filters.accountStatus.trim()) query.set("accountStatus", filters.accountStatus.trim());
  if (cursor) query.set("cursor", cursor);
  return readList(`/api/users?${query}`, isUser, signal);
}

/** Fetch the documented paginated catalog, without assuming fixed role IDs or names. */
export async function fetchUserRoles(signal: AbortSignal): Promise<UserRole[]> {
  const roles = new Map<string, UserRole>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const page = await readList(`/api/roles?${query}`, isRole, signal);
    for (const role of page.items) roles.set(role.id, role);
    cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor : null;
    if (cursor && cursors.has(cursor)) throw malformed();
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...roles.values()];
}
