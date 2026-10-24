import type { ReactNode } from "react";
import { acPermissions, canAccessAcPage, type AcPage } from "@/lib/ac-permissions";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/server/permissions";
import { adminNavigationBindings, adminRoutes, adminTestBindings, createNavigationConfig, filterNavigation } from "@/components/layout/navigation-config";
import { facultyPageHeaders, facultyRoutes } from "@/components/observations/faculty-routes";

// Reuse the existing Figma semester label; it is display context, not live cycle data.
const adminHeader = {
  subtitle: facultyPageHeaders[facultyRoutes.dashboard].subtitle,
  showUnavailableControls: true,
  contentSpacing: "spacious" as const,
};

const acPageHeaders = {
  "/ac": { title: "AC Dashboard", facultyLayout: true },
  "/ac/cycles": { title: "Evaluation Cycles", facultyLayout: true },
  "/ac/cycles/new": { title: "Create Evaluation Cycle", facultyLayout: true },
  "/ac/faculty": { title: "Faculty Due / Overdue", facultyLayout: true },
  "/ac/observations": { title: "Observation Progress", facultyLayout: true },
  "/ac/template": { title: "Observation Template", facultyLayout: true },
  "/ac/reports": { title: "Reports and KPIs", facultyLayout: true },
  "/ac/semester": { title: "Semester Settings", facultyLayout: true },
} as const;

export default async function MainLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const sections = createNavigationConfig({
    "faculty.dashboard": { href: facultyRoutes.dashboard, permission: "profile.read.own" },
    "faculty.evaluation": { href: facultyRoutes.evaluation, permission: "profile.read.own" },
    "faculty.requests": { href: facultyRoutes.requests, permission: "observations.read.own" },
    "faculty.observations": { href: facultyRoutes.observations, permission: "observations.read.own" },
    "faculty.history": { href: facultyRoutes.history, permission: "observations.read.own" },
    ...adminNavigationBindings,

    "ac.dashboard": { href: "/ac", permission: "reports.read" },
    "ac.cycles": { href: "/ac/cycles", permission: "cycles.read" },
    "ac.faculty": { href: "/ac/faculty", permission: "reports.read" },
    "ac.progress": { href: "/ac/observations", permission: "observations.read" },
    "ac.template": { href: "/ac/template", permission: "templates.manage" },
    "ac.reports": { href: "/ac/reports", permission: "reports.read" },
    "ac.semester": { href: "/ac/semester", permission: "cycles.manage" },
    ...adminTestBindings,
  });
  return (
    <AppShell
      authorizedSections={filterNavigation(sections, item => item.id in acPermissions ? canAccessAcPage(user.permissions, item.id as AcPage) : !!item.permission && user.permissions.includes(item.permission))}
      user={{ name: user.name, initials: user.name, description: user.roles.join(" · ") }}
      headerUser={{ name: user.name, initials: user.name }}
      pageHeaders={{
        ...facultyPageHeaders,
        ...acPageHeaders,
        [adminRoutes.dashboard]: { ...adminHeader, title: "Admin Dashboard" },
        [adminRoutes.users]: { ...adminHeader, title: "Users" },
        [adminRoutes.roles]: { ...adminHeader, title: "Roles & Permissions" },
        [adminRoutes.hiringLevels]: { ...adminHeader, title: "Hiring Levels & Frequency" },
        [`${adminRoutes.users}/new`]: { ...adminHeader, title: "Create User" },
        [`${adminRoutes.users}/[userId]`]: { ...adminHeader, title: "Edit User" },
      }}
    >
      {children}
    </AppShell>
  );
}
