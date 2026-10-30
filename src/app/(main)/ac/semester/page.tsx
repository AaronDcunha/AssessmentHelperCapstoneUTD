import Screen from "./semester-screen";
import { requireAcPage } from "@/server/ac-access";

export default async function Page() {
  const user = await requireAcPage("ac.semester");
  return <Screen canManage={user.permissions.includes("cycles.manage")} />;
}
