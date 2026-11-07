"use client";

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { NotificationBell } from "@/components/notifications/notification-bell";
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
  canReadNotifications?: boolean;
  subtitle?: string;
  pageHeaders?: Record<string, { title: string; subtitle?: string; facultyLayout?: boolean; contentSpacing?: "default" | "spacious"; showUnavailableControls?: boolean }>;
};

export function AppShell({ children, authorizedSections, user, headerUser, notificationAction, canReadNotifications = false, subtitle, pageHeaders }: AppShellProps) {
  const pathname = usePathname();
  const navigationId = useId();
  const contentId = useId();
  const navigation = useRef<HTMLDivElement>(null);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useLayoutEffect(() => {
    if (!mobileOpen && navigation.current?.contains(document.activeElement)
      && navigationToggle.current?.getClientRects().length) navigationToggle.current.focus();
  }, [mobileOpen]);
  useLayoutEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      const element = navigation.current;
      if (!element) return;
      const hidden = !mobileOpen && !desktop.matches;
      element.inert = hidden;
      if (hidden) element.setAttribute("aria-hidden", "true");
      else element.removeAttribute("aria-hidden");
    };
    update();
    desktop.addEventListener("change", update);
    return () => desktop.removeEventListener("change", update);
  }, [mobileOpen]);
  const current = authorizedSections.flatMap((section) => section.items.map((item) => ({ ...item, sectionId: section.id })))
    .filter((item) => typeof item.href === "string" && (pathname === item.href || pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => String(b.href).length - String(a.href).length)[0];
  // Exact entries take precedence over App Router-style dynamic route patterns.
  const pathSegments = pathname.split("/");
  const header = pageHeaders?.[pathname] ?? Object.entries(pageHeaders ?? {}).find(([route]) => {
    const segments = route.split("/");
    return segments.length === pathSegments.length && segments.every((segment, i) =>
      segment === pathSegments[i] || (/^\[[^\]]+\]$/.test(segment) && pathSegments[i] !== ""));
  })?.[1];
  const facultyLayout = header?.facultyLayout === true;
  const spaciousContent = facultyLayout || header?.contentSpacing === "spacious";
  const expandedSections = Object.fromEntries(authorizedSections.map((section) => [
    section.id, expanded[section.id] ?? (section.id === current?.sectionId || authorizedSections.length === 1),
  ]));

  return (
    <div className="flex min-h-screen flex-1 flex-col lg:flex-row"
      onPointerDownCapture={(event) => {
        if (mobileOpen && navigationToggle.current?.getClientRects().length
          && !navigation.current?.contains(event.target as Node)
          && !navigationToggle.current.contains(event.target as Node)) setMobileOpen(false);
      }}>
      <a href={`#${contentId}`} className="sr-only focus:not-sr-only focus:fixed focus:left-ah-16 focus:top-ah-16 focus:z-[100] focus:rounded-ah-8 focus:bg-surface focus:p-ah-16 focus:text-ink">Skip to main content</a>
      <div className="relative shrink-0 lg:contents">
      <button ref={navigationToggle} type="button" aria-expanded={mobileOpen} aria-controls={navigationId}
        onClick={() => setMobileOpen((open) => !open)}
        className="w-full bg-sidebar p-ah-16 text-left text-label text-light focus-visible:outline-light lg:hidden">
        {mobileOpen ? "Hide navigation" : "Show navigation"}
      </button>
      <div ref={navigation} id={navigationId} data-open={mobileOpen}
        className="ah-mobile-navigation shrink-0 lg:sticky lg:top-0 lg:self-start"
        onBlur={(event) => {
          if (mobileOpen && navigationToggle.current?.getClientRects().length
            && !event.currentTarget.contains(event.relatedTarget as Node | null)
            && event.relatedTarget !== navigationToggle.current) setMobileOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && mobileOpen) { event.preventDefault(); setMobileOpen(false); }
        }}>
        <div className="min-h-0 overflow-hidden lg:overflow-visible">
          <div className="h-[min(70dvh,640px)] min-h-[280px] lg:h-dvh lg:min-h-0">
            <Sidebar authorizedSections={authorizedSections} expandedSections={expandedSections}
              onExpandedChange={(id, open) => setExpanded((previous) => ({ ...previous, [id]: open }))}
              activeItemId={current?.id} onItemNavigate={() => setMobileOpen(false)} user={user} emptyMessage=""
              centerProfileText={facultyLayout}
              className="h-full w-full lg:w-[288px]" style={{ minHeight: "100%" }} />
          </div>
        </div>
      </div>
      </div>
      <div className={`min-w-0 flex-1 p-ah-24 ${spaciousContent ? "md:p-ah-48" : "md:p-ah-32"}`}>
        <div className="mx-auto w-full max-w-[1096px]">
          <PageHeader title={header?.title ?? current?.label ?? "Assessment Helper"}
            subtitle={header?.subtitle ?? subtitle} user={headerUser} notificationAction={notificationAction}
            notificationControl={canReadNotifications ? <NotificationBell /> : undefined}
            accountControl={headerUser && !headerUser.action ? (
              <AccountDropdown name={headerUser.name} initials={headerUser.initials}
                onLogout={() => signOut({ redirectTo: "/login" })} />
            ) : undefined}
            showUnavailableControls={header?.showUnavailableControls ?? facultyLayout}
            className={spaciousContent ? "mb-ah-32" : "mb-ah-24"} />
          <main id={contentId} tabIndex={-1}>{children}</main>
        </div>
      </div>
    </div>
  );
}
