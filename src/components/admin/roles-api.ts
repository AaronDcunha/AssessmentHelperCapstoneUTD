import { AdminApiError, isRevision, requestAdminJson, type Revision } from "./admin-api";

export type PermissionRole = { id: string; name: string; permissionKeys: string[]; revision: Revision };
export type PermissionDefinition = { key: string; name: string };
export type SavedPermissions = { roleId: string; permissionKeys: string[]; effectivePermissionKeys: string[]; revision: Revision };
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const keys = (v: unknown): v is string[] => Array.isArray(v) && v.every(text) && new Set(v).size === v.length;
const role = (v: unknown): v is PermissionRole => object(v) && text(v.id) && text(v.name) && keys(v.permissionKeys) && isRevision(v.revision);
const permission = (v: unknown): v is PermissionDefinition => object(v) && text(v.key) && text(v.name);
function malformed(mutation = false) {
  return new AdminApiError(mutation ? "The save may have completed, but its response was incomplete. Reload this role before retrying."
    : "The service returned an invalid permission catalog, role list, or revision. Please try again.", 200, {}, mutation);
}
export async function getPermissionRoles(signal?: AbortSignal): Promise<PermissionRole[]> {
  const result = new Map<string, PermissionRole>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const data = await requestAdminJson(`/api/roles?${query}`, "GET", undefined, signal);
    if (!object(data) || !Array.isArray(data.items) || !data.items.every(role) || !object(data.pageInfo)) throw malformed();
    const { nextCursor, hasMore } = data.pageInfo;
    if (typeof hasMore !== "boolean" || !(nextCursor === null || text(nextCursor)) || (hasMore && !text(nextCursor))) throw malformed();
    for (const item of data.items) {
      if (result.has(item.id)) throw malformed();
      result.set(item.id, item);
    }
    cursor = hasMore ? nextCursor as string : null;
    if (cursor && cursors.has(cursor)) throw malformed();
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...result.values()];
}
export async function getPermissionCatalog(signal?: AbortSignal): Promise<PermissionDefinition[]> {
  const data = await requestAdminJson("/api/permissions", "GET", undefined, signal);
  // This catalog explicitly returns {items}, not List<T>.
  if (!object(data) || !Array.isArray(data.items) || !data.items.every(permission)
    || new Set(data.items.map(item => item.key)).size !== data.items.length) throw malformed();
  return data.items;
}
export async function saveRolePermissions(roleId: string, permissionKeys: string[], expectedRevision: Revision): Promise<SavedPermissions> {
  if (!keys(permissionKeys) || !isRevision(expectedRevision)) throw new AdminApiError("The selection or revision is invalid. Reload this role before saving.", 422);
  const data = await requestAdminJson(`/api/roles/${encodeURIComponent(roleId)}/permissions`, "PUT", { permissionKeys, expectedRevision });
  if (!object(data) || data.roleId !== roleId || !keys(data.permissionKeys) || !keys(data.effectivePermissionKeys) || !isRevision(data.revision)) throw malformed(true);
  return { roleId, permissionKeys: data.permissionKeys, effectivePermissionKeys: data.effectivePermissionKeys, revision: data.revision };
}
