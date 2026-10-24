import { createUser, patchUser, putUserRoles, UserFormApiError, type FieldErrors, type UserRecord } from "./user-form-api";

export type UserDraft = {
  name: string; email: string; roleIds: string[]; accountStatus: string;
  departmentId: string; hiringLevelId: string; hireDate: string;
};
export const emptyUserDraft: UserDraft = {
  name: "", email: "", roleIds: [], accountStatus: "", departmentId: "", hiringLevelId: "", hireDate: "",
};
export function draftFromUser(user: UserRecord): UserDraft {
  return { name: user.name, email: user.email, roleIds: [...user.roleIds], accountStatus: String(user.accountStatus),
    departmentId: user.professor?.departmentId ?? "", hiringLevelId: user.professor?.hiringLevelId ?? "", hireDate: user.professor?.hireDate ?? "" };
}
export const sameRoles = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
const fields = ["name", "email", "accountStatus", "departmentId", "hiringLevelId", "hireDate"] as const;
export function rebaseDraft(draft: UserDraft, previous: UserRecord, latest: UserRecord): UserDraft {
  const before = draftFromUser(previous);
  const next = draftFromUser(latest);
  for (const field of fields) if (draft[field] !== before[field]) next[field] = draft[field];
  // Retain concurrent assignments; apply only this editor's explicit additions/removals.
  const removed = new Set(before.roleIds.filter(id => !draft.roleIds.includes(id)));
  next.roleIds = [...new Set([...latest.roleIds.filter(id => !removed.has(id)), ...draft.roleIds.filter(id => !before.roleIds.includes(id))])];
  return next;
}
export function validateUserDraft(draft: UserDraft, baseline: UserRecord | null, allowedRoles: string[]): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.name.trim()) errors.name = "Enter a full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) errors.email = "Enter a valid email address.";
  if (!draft.roleIds.length || draft.roleIds.some(id => !allowedRoles.includes(id) && !baseline?.roleIds.includes(id))) errors.roleIds = "Choose at least one available role.";
  if (draft.accountStatus !== "true" && draft.accountStatus !== "false") errors.accountStatus = "Choose Active or Inactive.";
  if (baseline?.professor || draft.hiringLevelId || draft.departmentId || draft.hireDate) {
    if (!draft.departmentId) errors["professor.departmentId"] = "Select a department for this faculty profile.";
    if (!draft.hiringLevelId) errors["professor.hiringLevelId"] = "Select a faculty hiring level.";
  }
  if (draft.hireDate && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.hireDate) || !Number.isFinite(Date.parse(draft.hireDate))
    || new Date(draft.hireDate).toISOString().slice(0, 10) !== draft.hireDate)) errors["professor.hireDate"] = "Enter a valid hire date.";
  if (baseline?.professor?.hireDate && !draft.hireDate) errors["professor.hireDate"] = "Clearing an existing hire date is not defined by the API. Keep the date or enter a replacement.";
  return errors;
}
function profile(draft: UserDraft) {
  return { departmentId: draft.departmentId, hiringLevelId: draft.hiringLevelId, ...(draft.hireDate ? { hireDate: draft.hireDate } : {}) };
}
function detailPatch(draft: UserDraft, user: UserRecord): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (draft.name.trim() !== user.name) result.name = draft.name.trim();
  if (draft.email.trim() !== user.email) result.email = draft.email.trim();
  if (draft.accountStatus !== String(user.accountStatus)) result.accountStatus = draft.accountStatus === "true";
  const before = draftFromUser(user);
  const changes: Record<string, string> = {};
  for (const field of ["departmentId", "hiringLevelId", "hireDate"] as const) if (draft[field] !== before[field]) changes[field] = draft[field];
  if (Object.keys(changes).length) result.professor = user.professor ? changes : profile(draft);
  return result;
}
/** PATCH and role replacement are independent operations. Never retry writes automatically. */
export async function saveUserDraft(draft: UserDraft, baseline: UserRecord | null) {
  let current = baseline;
  let detailsSaved = false;
  try {
    if (!current) {
      current = await createUser({ name: draft.name.trim(), email: draft.email.trim(), roleIds: draft.roleIds,
        accountStatus: draft.accountStatus === "true", ...(draft.hiringLevelId ? { professor: profile(draft) } : {}) });
      return { current, detailsSaved: true, error: null };
    }
    const patch = detailPatch(draft, current);
    if (Object.keys(patch).length) {
      current = await patchUser(current.id, { expectedRevision: current.revision, ...patch });
      detailsSaved = true;
    }
    if (!sameRoles(draft.roleIds, current.roleIds)) {
      const assigned = await putUserRoles(current.id, draft.roleIds, current.revision);
      current = { ...current, roleIds: assigned.roleIds, revision: assigned.revision };
    }
    return { current, detailsSaved, error: null };
  } catch (error) {
    return { current, detailsSaved, error: error instanceof UserFormApiError ? error
      : new UserFormApiError("The operation could not be verified. Reload the record before retrying.", 0, {}, true) };
  }
}
