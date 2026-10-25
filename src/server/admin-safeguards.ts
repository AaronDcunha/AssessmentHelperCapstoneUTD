import { ConfigurationError } from "./configuration-validation";
import { effectivePermissions } from "./admin-validation";
import { grantInclude, type Connection } from "./queries/admin";
const management = ["users.read","users.manage","roles.read","permissions.read","roles.assign","role-permissions.manage"];
export type AdminAccess = { managers: string[]; actorAdmin: boolean; actorPermissions: string[] };
export async function adminAccess(db: Connection,actorId: string): Promise<AdminAccess> {
  const [roles,accounts]=await Promise.all([
    db.role.findMany({include:grantInclude}),
    db.appUser.findMany({where:{isActive:true,userRoles:{some:{role:{roleName:"Admin"}}}},include:{userRoles:true}}),
  ]);
  const permissions=(a: typeof accounts[number])=>effectivePermissions(roles,a.userRoles.map(r=>r.roleId));
  const actor=accounts.find(a=>a.userId===actorId);
  return {managers:accounts.filter(a=>management.every(p=>permissions(a).includes(p))).map(a=>a.userId),
    actorAdmin:!!actor,actorPermissions:actor ? permissions(actor) : []};
}
export function preserveAdminAccess(before: AdminAccess,after: AdminAccess) {
  if (before.actorAdmin && (!after.actorAdmin || management.some(p=>before.actorPermissions.includes(p) && !after.actorPermissions.includes(p))))
    throw new ConfigurationError(409,"ADMIN_ACCESS_REQUIRED","You cannot remove your own active admin management access.");
  if (before.managers.length && !after.managers.length)
    throw new ConfigurationError(409,"ADMIN_ACCESS_REQUIRED","Keep at least one active admin with user and permission management access.");
}
