import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { createNavigationConfig } from "@/components/layout/navigation-config";
import { facultyPageHeaders, facultyRoutes } from "@/components/observations/faculty-routes";

export default function MainLayout({ children }: { children: ReactNode }) {
  // Auth integration: retain requireUser() from the auth branch here, then pass
  // server-authorized navigation and safe identity fields to AppShell. This component
  // branch has no auth backend. Pages/APIs must also check access independently.
  return (
  <AppShell
    // These routes contain only empty states and temporary frontend previews.
    // Replace these bindings with server-authorized destinations at auth integration.
    // No role or permission names are assumed here.
    authorizedSections={createNavigationConfig({
      "faculty.dashboard": { href: facultyRoutes.dashboard },
      "faculty.evaluation": { href: facultyRoutes.evaluation },
      "faculty.requests": { href: facultyRoutes.requests },
      "faculty.observations": { href: facultyRoutes.observations },
      "faculty.history": { href: facultyRoutes.history },
    })}
    pageHeaders={facultyPageHeaders}
  >
    {children}
  </AppShell>
);
}
