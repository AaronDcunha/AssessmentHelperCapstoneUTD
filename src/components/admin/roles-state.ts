import { AdminApiError } from "./admin-api";
import { getPermissionCatalog, getPermissionRoles, saveRolePermissions, type PermissionDefinition, type PermissionRole } from "./roles-api";

export type RoleFeedback = { message: string; error?: AdminApiError; blocked?: boolean; effectiveKeys?: string[] };
export type RolesState = {
  status: "loading" | "ready" | "error";
  roles: PermissionRole[]; permissions: PermissionDefinition[]; drafts: Record<string, string[]>;
  feedback: Record<string, RoleFeedback | undefined>; busyId: string | null; authDenied: boolean; error: AdminApiError | null;
};
export const initialRolesState: RolesState = {
  status: "loading", roles: [], permissions: [], drafts: {}, feedback: {}, busyId: null, authDenied: false, error: null,
};
export const samePermissionKeys = (a: string[], b: string[]) => a.length === b.length && a.every(key => b.includes(key));
export function rebasePermissionKeys(before: string[], edited: string[], latest: string[]) {
  const removed = new Set(before.filter(key => !edited.includes(key)));
  return [...new Set([...latest.filter(key => !removed.has(key)), ...edited.filter(key => !before.includes(key))])];
}
const failure = (error: unknown, mutation = false) => error instanceof AdminApiError ? error
  : new AdminApiError("The operation could not be verified. Please reload before retrying.", 0, {}, mutation);

/** Serialize writes and update only the selected role. Reads can be cancelled; writes are never retried automatically. */
export function createRolesController(publish: (state: RolesState) => void, api = {
  roles: getPermissionRoles, permissions: getPermissionCatalog, save: saveRolePermissions,
}) {
  let state = initialRolesState;
  let generation = 0;
  let read: AbortController | undefined;
  const update = (next: RolesState) => { state = next; publish(next); };
  const cancel = () => { generation++; read?.abort(); };
  async function load() {
    if (state.busyId) return;
    cancel();
    const current = generation;
    read = new AbortController();
    update({ ...initialRolesState });
    try {
      const [roles, permissions] = await Promise.all([api.roles(read.signal), api.permissions(read.signal)]);
      if (current !== generation) return;
      update({ ...initialRolesState, status: "ready", roles, permissions,
        drafts: Object.fromEntries(roles.map(role => [role.id, [...role.permissionKeys]])) });
    } catch (error) {
      if (current !== generation) return;
      update({ ...state, status: "error", error: failure(error) });
    }
  }
  function toggle(roleId: string, key: string, checked: boolean) {
    if (state.busyId || state.authDenied || state.status !== "ready" || !state.roles.some(role => role.id === roleId)
      || !state.permissions.some(permission => permission.key === key)) return;
    const previous = state.drafts[roleId];
    const next = checked ? [...new Set([...previous, key])] : previous.filter(value => value !== key);
    update({ ...state, drafts: { ...state.drafts, [roleId]: next }, feedback: { ...state.feedback,
      [roleId]: state.feedback[roleId]?.blocked ? state.feedback[roleId] : undefined } });
  }
  function discard(roleId: string) {
    const role = state.roles.find(role => role.id === roleId);
    if (!role || state.busyId) return;
    update({ ...state, drafts: { ...state.drafts, [roleId]: [...role.permissionKeys] }, feedback: { ...state.feedback,
      [roleId]: state.feedback[roleId]?.blocked ? state.feedback[roleId] : undefined } });
  }
  async function save(roleId: string) {
    const role = state.roles.find(role => role.id === roleId);
    const selected = state.drafts[roleId];
    if (!role || !selected || state.busyId || state.authDenied || state.feedback[roleId]?.blocked
      || samePermissionKeys(role.permissionKeys, selected)) return;
    const current = generation;
    update({ ...state, busyId: roleId, feedback: { ...state.feedback, [roleId]: undefined } });
    try {
      const result = await api.save(role.id, [...selected], role.revision);
      if (current !== generation) return;
      const complete = samePermissionKeys(selected, result.permissionKeys);
      update({ ...state, busyId: null, roles: state.roles.map(item => item.id === roleId
        ? { ...item, permissionKeys: result.permissionKeys, revision: result.revision } : item),
      drafts: { ...state.drafts, [roleId]: complete ? [...result.permissionKeys] : selected },
      feedback: { ...state.feedback, [roleId]: { message: complete ? "Permissions saved." : "The server returned different assignments. Review the remaining unsaved changes.",
        effectiveKeys: result.effectivePermissionKeys } } });
    } catch (error) {
      if (current !== generation) return;
      const rejected = failure(error, true);
      const denied = rejected.status === 401 || rejected.status === 403;
      update({ ...state, busyId: null, authDenied: denied || state.authDenied,
        feedback: { ...state.feedback, [roleId]: { message: rejected.message, error: rejected,
          blocked: rejected.uncertain || rejected.status === 409 || denied } } });
    }
  }
  async function reload(roleId: string) {
    const before = state.roles.find(role => role.id === roleId);
    if (!before || state.busyId || state.authDenied) return;
    const selected = state.drafts[roleId];
    const current = generation;
    read = new AbortController();
    update({ ...state, busyId: roleId });
    try {
      const roles = await api.roles(read.signal);
      if (current !== generation) return;
      const latest = roles.find(role => role.id === roleId);
      if (!latest) throw new AdminApiError("This role is no longer available. Unsaved changes are retained; no further save will be attempted until the role can be verified.", 404);
      update({ ...state, busyId: null, roles: state.roles.map(role => role.id === roleId ? latest : role),
        drafts: { ...state.drafts, [roleId]: rebasePermissionKeys(before.permissionKeys, selected, latest.permissionKeys) },
        feedback: { ...state.feedback, [roleId]: { message: "Latest assignments loaded. Review your preserved edits before saving." } } });
    } catch (error) {
      if (current !== generation) return;
      const rejected = failure(error);
      update({ ...state, busyId: null, authDenied: [401, 403].includes(rejected.status) || state.authDenied,
        feedback: { ...state.feedback, [roleId]: { message: rejected.message, error: rejected, blocked: true } } });
    }
  }
  return { load, toggle, discard, save, reload, cancel };
}
