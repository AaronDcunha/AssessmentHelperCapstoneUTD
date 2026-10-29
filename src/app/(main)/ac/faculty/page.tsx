import Screen from "./faculty-screen";
import { requireAcPage } from "@/server/ac-access";

export default async function Page() {
  const user = await requireAcPage("ac.faculty");
  return <Screen canSendReminders={user.permissions.includes("notifications.send") && user.permissions.includes("cycles.read")} />;
}
