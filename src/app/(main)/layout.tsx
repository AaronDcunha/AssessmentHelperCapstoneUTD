import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/server/permissions";
import { adminTestBindings, createNavigationConfig, filterNavigation } from "@/components/layout/navigation-config";
import { facultyPageHeaders, facultyRoutes } from "@/components/observations/faculty-routes";

const acPageHeaders = {
  "/ac": { title: "AC Dashboard", subtitle: "Fall 2026", facultyLayout: true },
  "/ac/cycles": { title: "Evaluation Cycles", subtitle: "Fall 2026", facultyLayout: true },
  "/ac/faculty": { title: "Faculty Due / Overdue", subtitle: "Fall 2026", facultyLayout: true },
  "/ac/observations": { title: "Observation Progress", subtitle: "Fall 2026", facultyLayout: true },
  "/ac/template": { title: "Observation Template", subtitle: "Fall 2026", facultyLayout: true },
  "/ac/reports": { title: "Reports and KPIs", subtitle: "Fall 2026", facultyLayout: true },
  "/ac/semester": { title: "Semester Settings", subtitle: "Fall 2026", facultyLayout: true },
} as const;

export default async function MainLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const sections = createNavigationConfig({
    "faculty.dashboard": { href: facultyRoutes.dashboard, permission: "profile.read.own" },
    "faculty.evaluation": { href: facultyRoutes.evaluation, permission: "profile.read.own" },
    "faculty.requests": { href: facultyRoutes.requests, permission: "observations.read.own" },
    "faculty.observations": { href: facultyRoutes.observations, permission: "observations.read.own" },
    "faculty.history": { href: facultyRoutes.history, permission: "observations.read.own" },
    "ac.dashboard": { href: "/ac", permission: "test:ac" },
    "ac.cycles": { href: "/ac/cycles", permission: "test:ac" },
    "ac.faculty": { href: "/ac/faculty", permission: "test:ac" },
    "ac.progress": { href: "/ac/observations", permission: "test:ac" },
    "ac.template": { href: "/ac/template", permission: "test:ac" },
    "ac.reports": { href: "/ac/reports", permission: "test:ac" },
    "ac.semester": { href: "/ac/semester", permission: "test:ac" },
    ...adminTestBindings,
  });
  return (
    <AppShell
      authorizedSections={filterNavigation(sections, item => !!item.permission && user.permissions.includes(item.permission))}
      user={{ name: user.name, initials: user.name, description: user.roles.join(" · ") }}
      headerUser={{ name: user.name, initials: user.name }}
      pageHeaders={{ ...facultyPageHeaders, ...acPageHeaders }}
    >
      {children}
    </AppShell>
  );
}
