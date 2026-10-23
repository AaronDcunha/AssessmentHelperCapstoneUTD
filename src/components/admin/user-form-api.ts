import { fetchUsers, fetchUserRoles, readList } from "./users-api";

export type Revision = string | number;
export type FacultyProfile = { departmentId: string; hiringLevelId: string; hireDate?: string | null };
export type UserRecord = {
  id: string; name: string; email: string; accountStatus: string; roleIds: string[];
  professor: FacultyProfile | null; revision: Revision;
};
export type Department = { id: string; code: string; name: string };
export type HiringLevel = { id: string; name: string; active: boolean };
export type RoleAssignment = { userId: string; roleIds: string[]; permissions: string[]; revision: Revision };
export type FieldErrors = Record<string, string>;

export class UserFormApiError extends Error {
  constructor(message: string, public status = 0, public fieldErrors: FieldErrors = {}, public uncertain = false) {
    super(message);
    this.name = "UserFormApiError";
  }
}

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const revision = (v: unknown): v is Revision => text(v) || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0);
const profile = (v: unknown): v is FacultyProfile => object(v) && text(v.departmentId) && text(v.hiringLevelId)
  && (v.hireDate === undefined || v.hireDate === null || typeof v.hireDate === "string");
const user = (v: unknown): v is UserRecord => object(v) && text(v.id) && text(v.name) && typeof v.email === "string"
  && text(v.accountStatus) && strings(v.roleIds) && (v.professor === null || profile(v.professor)) && revision(v.revision);
const assignment = (v: unknown): v is RoleAssignment => object(v) && text(v.userId) && strings(v.roleIds)
  && strings(v.permissions) && revision(v.revision);
const department = (v: unknown): v is Department => object(v) && text(v.id) && typeof v.code === "string" && text(v.name);
const level = (v: unknown): v is HiringLevel => object(v) && text(v.id) && text(v.name) && typeof v.active === "boolean";
export const userPath = (id: string) => `/api/users/${encodeURIComponent(id)}`;

/** Same-origin cookie requests; backend remains responsible for origin/CSRF and permission checks. */
async function request(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const mutation = method !== "GET";
  let response: Response;
  try {
    response = await fetch(path, {
      method, signal, credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new UserFormApiError(mutation ? "The connection failed. The operation may have completed; verify the record before trying again."
      : "Unable to connect to the service. Please try again.", 0, {}, mutation);
  }
  const json = /application\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get("content-type") ?? "");
  let data: unknown;
  if (json && !response.redirected) {
    try { data = await response.json(); } catch { /* Converted to an explicit malformed response below. */ }
  }
  if (!response.ok) {
    const errors: FieldErrors = {};
    if (object(data) && object(data.error) && object(data.error.fieldErrors)) {
      for (const [key, value] of Object.entries(data.error.fieldErrors)) {
        if (typeof value === "string") errors[key] = value;
        else if (Array.isArray(value) && value.every(v => typeof v === "string")) errors[key] = value.join(" ");
      }
    }
    const messages: Record<number, string> = {
      400: "The request was rejected. Check the fields below.",
      401: "Your session has expired or the account is inactive. Sign in again.",
      403: "You do not have permission to perform this operation.",
      404: "The record or API endpoint is unavailable.",
      409: "The operation conflicts with the current record (for example, a duplicate email, stale revision, or account safeguard). Review the fields and reload the latest record before retrying an edit.",
      422: "Some fields were rejected. Review the form and try again.",
    };
    throw new UserFormApiError(messages[response.status] ?? "The service could not complete the request. Please try again.",
      response.status, errors, mutation && response.status >= 500);
  }
  if (method === "DELETE" && response.status === 204 && !response.redirected) return null;
  if (response.redirected || !json || data === undefined) {
    throw new UserFormApiError(mutation ? "The service returned an unexpected response. The operation may have completed; verify the record before retrying."
      : "The API is unavailable or returned an unexpected response.", response.status, {}, mutation);
  }
  return data;
}

function malformed(mutation: boolean) {
  return new UserFormApiError(mutation ? "The operation may have completed, but its response was incomplete. Verify the record before retrying."
    : "The service returned incomplete user data or no usable revision.", 200, {}, mutation);
}
export async function getUser(id: string, signal?: AbortSignal): Promise<UserRecord> {
  const data = await request(userPath(id), "GET", undefined, signal);
  if (!user(data) || data.id !== id) throw malformed(false);
  return data;
}
export async function createUser(body: unknown): Promise<UserRecord> {
  const data = await request("/api/users", "POST", body);
  if (!user(data)) throw malformed(true);
  return data;
}
export async function patchUser(id: string, body: unknown): Promise<UserRecord> {
  const data = await request(userPath(id), "PATCH", body);
  if (!user(data) || data.id !== id) throw malformed(true);
  return data;
}
export async function putUserRoles(id: string, roleIds: string[], expectedRevision: Revision): Promise<RoleAssignment> {
  const data = await request(`${userPath(id)}/roles`, "PUT", { roleIds, expectedRevision });
  if (!assignment(data) || data.userId !== id) throw malformed(true);
  return data;
}
export async function deleteUser(id: string): Promise<void> {
  const data = await request(userPath(id), "DELETE");
  if (data !== null) throw malformed(true);
}
export { fetchUserRoles };
export async function getDepartments(signal: AbortSignal): Promise<Department[]> {
  const result = new Map<string, Department>();
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const page = await readList(`/api/departments?${query}`, department, signal);
    for (const item of page.items) result.set(item.id, item);
    cursor = page.pageInfo.hasMore ? page.pageInfo.nextCursor : null;
    if (cursor && seen.has(cursor)) throw malformed(false);
    if (cursor) seen.add(cursor);
  } while (cursor);
  return [...result.values()];
}
export async function getHiringLevels(signal: AbortSignal): Promise<HiringLevel[]> {
  const data = await request("/api/hiring-levels", "GET", undefined, signal);
  // This endpoint explicitly returns {items}, unlike the cursor-paginated catalogs.
  if (!object(data) || !Array.isArray(data.items) || !data.items.every(level)) throw malformed(false);
  return data.items;
}
export async function getAccountStatuses(signal: AbortSignal): Promise<string[]> {
  // No status-catalog endpoint/enum exists. Offer only exact values observed in the API.
  const page = await fetchUsers({ q: "", roleId: "", accountStatus: "" }, null, signal);
  return [...new Set(page.items.map(item => item.accountStatus))];
}
