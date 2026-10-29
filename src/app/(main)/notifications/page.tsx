import type { Metadata } from "next";
import { requirePermission } from "@/server/permissions";
import { NotificationsScreen } from "@/components/notifications/notifications-screen";
export const metadata: Metadata = { title: "Notifications | Assessment Helper" };
export default async function Page() {
  const user = await requirePermission("notifications.read.own");
  return <NotificationsScreen permissions={user.permissions} />;
}
