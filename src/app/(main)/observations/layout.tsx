import type { ReactNode } from "react";
import { requirePermission } from "@/server/permissions";

export default async function FacultyObservationsLayout({ children }: { children: ReactNode }) {
  await requirePermission("observations.read.own");
  return <>{children}</>;
}
