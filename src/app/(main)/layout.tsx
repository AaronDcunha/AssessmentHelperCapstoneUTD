import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/server/permissions";
import { adminNavigationBindings, adminRoutes, adminTestBindings, createNavigationConfig, filterNavigation } from "@/components/layout/navigation-config";
import { facultyPageHeaders, facultyRoutes } from "@/components/observations/faculty-routes";

export default async function MainLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const sections = createNavigationConfig({
    "faculty.dashboard": { href: facultyRoutes.dashboard, permission: "profile.read.own" },
    "faculty.evaluation": { href: facultyRoutes.evaluation, permission: "profile.read.own" },
    "faculty.requests": { href: facultyRoutes.requests, permission: "observations.read.own" },
    "faculty.observations": { href: facultyRoutes.observations, permission: "observations.read.own" },
    "faculty.history": { href: facultyRoutes.history, permission: "observations.read.own" },
    ...adminNavigationBindings,
    ...adminTestBindings,
  });
  return (
    <AppShell
      authorizedSections={filterNavigation(sections, item => !!item.permission && user.permissions.includes(item.permission))}
      user={{ name: user.name, initials: user.name, description: user.roles.join(" · ") }}
      headerUser={{ name: user.name, initials: user.name }}
      pageHeaders={{
        ...facultyPageHeaders,
        [adminRoutes.dashboard]: { title: "Admin Dashboard", contentSpacing: "spacious" },
        [adminRoutes.users]: { title: "Users", contentSpacing: "spacious" },
        [`${adminRoutes.users}/new`]: { title: "Create User", contentSpacing: "spacious" },
        [`${adminRoutes.users}/[userId]`]: { title: "Edit User", contentSpacing: "spacious" },
      }}
    >
      {children}
    </AppShell>
  );
}
