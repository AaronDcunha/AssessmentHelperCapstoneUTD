import Screen from "./cycles-screen";
import { requireAcPage } from "@/server/ac-access";

export default async function Page() {
  const user = await requireAcPage("ac.cycles");
  return <Screen canManage={user.permissions.includes("cycles.manage")} />;
}
