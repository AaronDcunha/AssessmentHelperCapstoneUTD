"use client";

import { useId, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { AccountDropdown } from "./account-dropdown";
import { Sidebar, type SidebarProps } from "./sidebar";
import { PageHeader, type PageHeaderProps } from "./page-header";
import type { NavigationSection } from "./navigation-config";

export type AppShellProps = {
  children: ReactNode;
  /** Supply server-authorized destinations when integrating authentication. */
  authorizedSections: readonly NavigationSection[];
  user?: SidebarProps["user"];
  headerUser?: PageHeaderProps["user"];
  notificationAction?: PageHeaderProps["notificationAction"];
  subtitle?: string;
  pageHeaders?: Record<string, { title: string; subtitle?: string }>;
};

export function AppShell({ children, authorizedSections, user, headerUser, notificationAction, subtitle, pageHeaders }: AppShellProps) {
  const pathname = usePathname();
  const navigationId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const current = authorizedSections.flatMap((section) => section.items.map((item) => ({ ...item, sectionId: section.id })))
    .filter((item) => typeof item.href === "string" && (pathname === item.href || pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => String(b.href).length - String(a.href).length)[0];
  const header = pageHeaders?.[pathname];
  const expandedSections = Object.fromEntries(authorizedSections.map((section) => [
    section.id, expanded[section.id] ?? (section.id === current?.sectionId || authorizedSections.length === 1),
  ]));

  return (
    <div className="flex min-h-screen flex-1 flex-col lg:flex-row">
      <button type="button" aria-expanded={mobileOpen} aria-controls={navigationId}
        onClick={() => setMobileOpen((open) => !open)}
        className="bg-sidebar p-ah-16 text-left text-label text-light focus-visible:outline-light lg:hidden">
        {mobileOpen ? "Hide navigation" : "Show navigation"}
      </button>
      <div id={navigationId} className={`${mobileOpen ? "block" : "hidden"} shrink-0 lg:block`}>
        <Sidebar authorizedSections={authorizedSections} expandedSections={expandedSections}
          onExpandedChange={(id, open) => setExpanded((previous) => ({ ...previous, [id]: open }))}
          activeItemId={current?.id} onItemNavigate={() => setMobileOpen(false)} user={user} emptyMessage=""
          className="h-full w-full lg:w-[288px]" style={{ minHeight: "100%" }} />
      </div>
      <div className="min-w-0 flex-1 p-ah-24 md:p-ah-32">
        <div className="mx-auto w-full max-w-[1096px]">
          <PageHeader title={header?.title ?? current?.label ?? "Assessment Helper"}
            subtitle={header?.subtitle ?? subtitle} user={headerUser} notificationAction={notificationAction}
            accountControl={headerUser && !headerUser.action ? (
              <AccountDropdown name={headerUser.name} initials={headerUser.initials}
                onLogout={() => signOut({ redirectTo: "/login" })} />
            ) : undefined}
            className="mb-ah-24" />
          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
