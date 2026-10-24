import { AdminApiError, isRevision, requestAdminJson, type Revision } from "./admin-api";

export type HiringLevel = { id: string; name: string; evaluationIntervalYears: number; active: boolean; revision: Revision };
export type HiringLevelCreate = { name: string; evaluationIntervalYears: number };
export type HiringLevelPatch = { expectedRevision: Revision; name?: string; evaluationIntervalYears?: number; active?: boolean };
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isLevel = (v: unknown): v is HiringLevel => object(v) && text(v.id) && text(v.name)
  && typeof v.evaluationIntervalYears === "number" && Number.isSafeInteger(v.evaluationIntervalYears) && v.evaluationIntervalYears > 0
  && typeof v.active === "boolean" && isRevision(v.revision);
const path = (id: string) => `/api/hiring-levels/${encodeURIComponent(id)}`;
function malformed(mutation = false) {
  return new AdminApiError(mutation ? "The operation may have completed, but its response was invalid. Verify the hiring levels before trying again."
    : "The service returned invalid hiring-level data, pagination, or revisions. Please try again.", 200, {}, mutation);
}
export async function getHiringLevels(signal?: AbortSignal): Promise<HiringLevel[]> {
  const levels = new Map<string, HiringLevel>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const data = await requestAdminJson(`/api/hiring-levels?${query}`, "GET", undefined, signal);
    if (!object(data) || !Array.isArray(data.items) || !data.items.every(isLevel)) throw malformed();
    for (const level of data.items) {
      if (levels.has(level.id)) throw malformed();
      levels.set(level.id, level);
    }
    cursor = null;
    // The endpoint explicitly permits {items}. Honor global cursor conventions if pageInfo is supplied.
    if (data.pageInfo !== undefined) {
      if (!object(data.pageInfo)) throw malformed();
      const { hasMore, nextCursor } = data.pageInfo;
      if (typeof hasMore !== "boolean" || !(nextCursor === null || text(nextCursor)) || (hasMore && !text(nextCursor))) throw malformed();
      cursor = hasMore ? nextCursor as string : null;
      if (cursor && cursors.has(cursor)) throw malformed();
      if (cursor) cursors.add(cursor);
    }
  } while (cursor);
  return [...levels.values()];
}
export async function createHiringLevel(body: HiringLevelCreate): Promise<HiringLevel> {
  const data = await requestAdminJson("/api/hiring-levels", "POST", body);
  if (!isLevel(data)) throw malformed(true);
  return data;
}
export async function patchHiringLevel(id: string, body: HiringLevelPatch): Promise<HiringLevel> {
  const data = await requestAdminJson(path(id), "PATCH", body);
  if (!isLevel(data) || data.id !== id) throw malformed(true);
  return data;
}
export async function removeHiringLevel(id: string): Promise<void> {
  try {
    const data = await requestAdminJson(path(id), "DELETE");
    if (data !== null) throw malformed(true);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 409) {
      throw new AdminApiError("This hiring level could not be removed. It may be in use or protected by a retention rule. No removal was confirmed.", 409, error.fieldErrors);
    }
    throw error;
  }
}
