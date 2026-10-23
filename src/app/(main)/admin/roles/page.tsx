import { RolesPermissions } from "@/components/admin/roles-permissions";
import { requirePermission } from "@/server/permissions";

export default async function RolesPermissionsPage() {
  const user = await requirePermission("roles.read");
  return <RolesPermissions canManage={user.permissions.includes("role-permissions.manage")} />;
}
