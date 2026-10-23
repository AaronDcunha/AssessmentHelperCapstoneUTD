import { fetchUsers, fetchUserRoles, readList } from "./users-api";
import { AdminApiError as UserFormApiError, requestAdminJson as request, isRevision as revision } from "./admin-api";
export { AdminApiError as UserFormApiError } from "./admin-api";
export type { Revision, FieldErrors } from "./admin-api";
import type { Revision } from "./admin-api";

export type FacultyProfile = { departmentId: string; hiringLevelId: string; hireDate?: string | null };
export type UserRecord = {
  id: string; name: string; email: string; accountStatus: string; roleIds: string[];
  professor: FacultyProfile | null; revision: Revision;
};
export type Department = { id: string; code: string; name: string };
export type HiringLevel = { id: string; name: string; active: boolean };
export type RoleAssignment = { userId: string; roleIds: string[]; permissions: string[]; revision: Revision };

const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const profile = (v: unknown): v is FacultyProfile => object(v) && text(v.departmentId) && text(v.hiringLevelId)
  && (v.hireDate === undefined || v.hireDate === null || typeof v.hireDate === "string");
const user = (v: unknown): v is UserRecord => object(v) && text(v.id) && text(v.name) && typeof v.email === "string"
  && text(v.accountStatus) && strings(v.roleIds) && (v.professor === null || profile(v.professor)) && revision(v.revision);
const assignment = (v: unknown): v is RoleAssignment => object(v) && text(v.userId) && strings(v.roleIds)
  && strings(v.permissions) && revision(v.revision);
const department = (v: unknown): v is Department => object(v) && text(v.id) && typeof v.code === "string" && text(v.name);
const level = (v: unknown): v is HiringLevel => object(v) && text(v.id) && text(v.name) && typeof v.active === "boolean";
export const userPath = (id: string) => `/api/users/${encodeURIComponent(id)}`;

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
