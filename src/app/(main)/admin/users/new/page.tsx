import { UserForm } from "@/components/admin/user-form";
import { requirePermission } from "@/server/permissions";

export default async function CreateUserPage() {
  await requirePermission("users.manage");
  return <UserForm />;
}
