import { UserForm } from "@/components/admin/user-form";
import { requirePermission } from "@/server/permissions";

export default async function EditUserPage({ params }: { params: Promise<{ userId: string }> }) {
  await requirePermission("users.manage");
  const { userId } = await params;
  return <UserForm key={userId} userId={userId} />;
}
