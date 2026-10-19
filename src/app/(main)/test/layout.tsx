import type { ReactNode } from "react";
import { requirePermission } from "@/server/permissions";

/** All component and role test pages are temporary administrator-only tools. */
export default async function TestLayout({ children }: { children: ReactNode }) {
  await requirePermission("test:admin");
  return <>{children}</>;
}
