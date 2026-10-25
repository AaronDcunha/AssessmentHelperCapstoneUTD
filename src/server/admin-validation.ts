import { ConfigurationError, invalid, fields, object, text, uuid, date, revision, type ConfigurationUser } from "./configuration-validation";
export type AdminUser = ConfigurationUser;
export const grants = {
  "users.list": ["users.read"], "users.get": ["users.manage"], "users.create": ["users.manage", "roles.assign"],
  "users.update": ["users.manage"], "users.delete": ["users.manage"], "users.roles": ["roles.assign"],
  "roles.list": ["roles.read"], "permissions.list": ["permissions.read"], "roles.permissions": ["role-permissions.manage"],
  "levels.list": ["hiring-levels.read"], "levels.create": ["hiring-levels.manage"],
  "levels.update": ["hiring-levels.manage"], "levels.delete": ["hiring-levels.manage"],
  "departments.list": ["users.manage"],
} as const;
export type Operation = keyof typeof grants;
export function authorize(user: AdminUser, operation: Operation) {
  if (!grants[operation].every(key => user.permissions.includes(key))) throw new ConfigurationError(403,"FORBIDDEN","Permission denied.");
}
export function required<T>(value: T | null): T {
  if (!value) throw new ConfigurationError(404,"NOT_FOUND","Record not found.");
  return value;
}
export function conflict(): never { throw new ConfigurationError(409,"STALE_REVISION","The record changed. Reload before saving."); }
export function bool(value: unknown): boolean { if (typeof value !== "boolean") invalid("Expected a boolean."); return value; }
export function strings(value: unknown, ids = true): string[] {
  if (!Array.isArray(value) || value.length > 1000) invalid("Expected an array of at most 1000 values.");
  const result = value.map(item => ids ? uuid(item) : text(item));
  if (new Set(result).size !== result.length) invalid("Duplicate selections.");
  return result;
}
export function userInput(value: unknown, create: boolean) {
  const b = object(value); fields(b,create ? ["name","email","accountStatus","roleIds","professor"] : ["expectedRevision","name","email","accountStatus","professor"]);
  const data: { fullName?: string; email?: string; isActive?: boolean } = {};
  if (create || b.name !== undefined) data.fullName = text(b.name);
  if (create || b.email !== undefined) {
    data.email = text(b.email).toLowerCase();
    if (data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) invalid("Enter a valid email address.");
  }
  if (create || b.accountStatus !== undefined) data.isActive = bool(b.accountStatus);
  const roleIds = create ? strings(b.roleIds) : undefined;
  if (roleIds && !roleIds.length) invalid("Select at least one role.");
  let profile: {departmentId?: string; hiringLevelId?: string; hireDate?: Date} | undefined;
  if (b.professor !== undefined) {
    const p = object(b.professor); fields(p,["departmentId","hiringLevelId","hireDate"]); profile = {};
    if (create || p.departmentId !== undefined) profile.departmentId = uuid(p.departmentId);
    if (create || p.hiringLevelId !== undefined) profile.hiringLevelId = uuid(p.hiringLevelId);
    if (p.hireDate !== undefined) profile.hireDate = new Date(date(p.hireDate));
    if (!Object.keys(profile).length) invalid("Supply profile changes.");
  }
  if (!create && !Object.keys(data).length && !profile) invalid("Supply user changes.");
  return { data, roleIds, profile, expectedRevision: create ? undefined : revision(b.expectedRevision) };
}
export function levelInput(value: unknown, create: boolean) {
  const b = object(value); fields(b,create ? ["name","evaluationIntervalYears"] : ["name","evaluationIntervalYears","active","expectedRevision"]);
  const data: {levelName?: string; evaluationIntervalYears?: number; active?: boolean} = {};
  if (create || b.name !== undefined) data.levelName = text(b.name);
  if (create || b.evaluationIntervalYears !== undefined) {
    if (!Number.isInteger(b.evaluationIntervalYears) || (b.evaluationIntervalYears as number) < 1 || (b.evaluationIntervalYears as number) > 2147483647) invalid("Evaluation interval must be a positive 32-bit whole number of years.");
    data.evaluationIntervalYears = b.evaluationIntervalYears as number;
  }
  if (b.active !== undefined) data.active = bool(b.active);
  if (!Object.keys(data).length) invalid("Supply hiring-level changes.");
  return {data, expectedRevision:create ? undefined : revision(b.expectedRevision)};
}
export type GrantRole = {roleId: string; roleName: string; rolePermissions: {permission: {permissionName: string}}[]};
export function effectivePermissions(roles: GrantRole[], assignedIds: string[]) {
  const assigned = roles.filter(r => assignedIds.includes(r.roleId));
  const names = new Set(assigned.map(r => r.roleName));
  const included = roles.filter(r => assignedIds.includes(r.roleId) || (names.has("Admin") && ["AC","Faculty"].includes(r.roleName)) || (names.has("AC") && r.roleName === "Faculty"));
  return [...new Set(included.flatMap(r => r.rolePermissions.map(p => p.permission.permissionName)))].sort();
}
