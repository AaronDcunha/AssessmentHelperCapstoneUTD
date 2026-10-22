import type { ReactNode } from "react";
import { requirePermission } from "@/server/permissions";

export default async function AcLayout({ children }: { children: ReactNode }) {
  await requirePermission("test:ac");
  return <>{children}</>;
}
