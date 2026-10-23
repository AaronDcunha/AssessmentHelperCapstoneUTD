import { UsersList } from "@/components/admin/users-list";
import { requirePermission } from "@/server/permissions";

export default async function AdminUsersPage() {
  const user = await requirePermission("users.read");
  return <UsersList canManageUsers={user.permissions.includes("users.manage")} canReadRoles={user.permissions.includes("roles.read")} />;
}
