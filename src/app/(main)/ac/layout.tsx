import type { ReactNode } from "react";
import { requireUser } from "@/server/permissions";
import { AcCycleProvider } from "@/components/ac/cycle-context";

export default async function AcLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <AcCycleProvider canReadCycles={user.permissions.includes("cycles.read") || user.permissions.includes("cycles.manage")}>{children}</AcCycleProvider>;
}
