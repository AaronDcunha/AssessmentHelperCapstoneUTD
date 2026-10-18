import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/server/permissions";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  // Navigation stays empty until application destinations are ready.
  // Pages/APIs must also check permissions and record ownership independently.
  return <AppShell authorizedSections={[]}
    user={{ name: user.name, initials: user.name, description: user.roles.join(" · ") }}
    headerUser={{ name: user.name, initials: user.name }}>
    {children}
  </AppShell>;
}
