import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function MainLayout({ children }: { children: ReactNode }) {
  // Auth integration: retain requireUser() from the auth branch here, then pass
  // server-authorized navigation and safe identity fields to AppShell. This component
  // branch has no auth backend. Pages/APIs must also check access independently.
  return <AppShell authorizedSections={[]}>{children}</AppShell>;
}
