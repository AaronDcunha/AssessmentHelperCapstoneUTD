import type { ReactNode } from "react";
import { requirePermission } from "@/server/permissions";

export default async function FacultyDashboardLayout({ children }: { children: ReactNode }) {
  await requirePermission("profile.read.own");
  return <>{children}</>;
}
