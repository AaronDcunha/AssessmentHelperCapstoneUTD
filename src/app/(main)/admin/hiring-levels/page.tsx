import { HiringLevels } from "@/components/admin/hiring-levels";
import { requirePermission } from "@/server/permissions";

export default async function HiringLevelsPage() {
  const user = await requirePermission("hiring-levels.read");
  return <HiringLevels canManage={user.permissions.includes("hiring-levels.manage")} />;
}
