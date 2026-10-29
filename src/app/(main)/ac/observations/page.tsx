import Screen from "./progress-screen";
import { requireAcPage } from "@/server/ac-access";

export default async function Page() {
  const user = await requireAcPage("ac.progress");
  return <Screen canSendReminders={user.permissions.includes("notifications.send") && user.permissions.includes("cycles.read")} />;
}
