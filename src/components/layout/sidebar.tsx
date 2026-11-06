"use client";

import { useCallback, useId, useLayoutEffect, useRef, type ComponentProps } from "react";
import { Avatar } from "@/components/ui/avatar";
import { BookIcon } from "@/components/ui/icons";
import { NavigationItem, UnavailableNavigationItem } from "./navigation-item";
import { RoleHeading } from "./role-heading";
import { filterNavigation, navigationIcons, type NavigationAuthorization, type NavigationDestination, type NavigationSection } from "./navigation-config";

type SidebarAuthorization =
  | { authorizedSections: readonly NavigationSection[]; sections?: never; canAccess?: never }
  | { sections: readonly NavigationSection[]; canAccess: NavigationAuthorization; authorizedSections?: never };

export type SidebarProps = Omit<ComponentProps<"aside">, "children"> & SidebarAuthorization & {
  expandedSections: Readonly<Record<string, boolean>>;
  onExpandedChange: (sectionId: string, expanded: boolean) => void;
  /** Parent-selected destination; the parent owns exact/nested/query/hash matching. */
  activeItemId?: string;
  onItemNavigate?: (item: NavigationDestination) => void;
  navigationLabel?: string;
  emptyMessage?: string;
  user?: {
    name?: string | null;
    initials?: string | null;
    /** Display-only identity summary; never used to authorize destinations. */
    description?: string | null;
    /** Optional spoken alternative to the visible name, announced once. */
    accessibleName?: string;
  };
  missingUserLabel?: string;
  /** Center the profile text block beside the avatar, including the missing-user fallback. */
  centerProfileText?: boolean;
};

function SidebarSection({ section, prefix, expanded, onExpandedChange, activeItemId, onItemNavigate }: {
  section: NavigationSection; prefix: string; expanded: boolean;
  onExpandedChange: SidebarProps["onExpandedChange"];
  activeItemId?: string; onItemNavigate?: SidebarProps["onItemNavigate"];
}) {
  const headingRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const Icon = navigationIcons[section.icon];
  const panelId = `${prefix}-${section.id}-panel`;

  useLayoutEffect(() => {
    // A parent can collapse a section while focus is inside it; keep focus on a visible control.
    if (!expanded && panelRef.current?.contains(document.activeElement)) headingRef.current?.focus();
  }, [expanded]);

  return (
    <div className="min-w-0" data-navigation-section={section.id}>
      <RoleHeading ref={headingRef} label={section.label} icon={<Icon />}
        expanded={expanded} onExpandedChange={(next) => onExpandedChange(section.id, next)} aria-controls={panelId} />
      <div aria-hidden={!expanded} inert={!expanded}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          <ul ref={panelRef} id={panelId} className="space-y-ah-4 pb-ah-16 pt-ah-4 pl-ah-24 pr-ah-16">
            {section.items.map((item) => {
              const ItemIcon = navigationIcons[item.icon];
              return (
                <li key={item.id}>
                  {item.href !== undefined ? <NavigationItem label={item.label} href={item.href} icon={<ItemIcon />}
                    active={item.id === activeItemId} onNavigate={() => onItemNavigate?.(item)} data-navigation-item={item.id} />
                    : <UnavailableNavigationItem label={item.label} icon={<ItemIcon />} reason={item.unavailableReason} />}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** One sidebar for any combination of authorized sections. No identity fetching or role grants. */
export function Sidebar({
  authorizedSections, sections, canAccess, expandedSections, onExpandedChange, activeItemId, onItemNavigate,
  user, missingUserLabel = "User information unavailable", navigationLabel = "Main navigation",
  emptyMessage = "No navigation available.", centerProfileText = false, className, ...props
}: SidebarProps) {
  const prefix = useId();
  const visibleSections = filterNavigation(authorizedSections ?? sections ?? [], authorizedSections !== undefined ? () => true : canAccess ?? (() => false));
  const name = user?.name?.trim() || missingUserLabel;
  const accessibleName = user?.accessibleName?.trim();
  const sectionIds = visibleSections.map(section => section.id).join(",");
  const navigation = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const animation = useRef<Animation | null>(null);
  const indicatorItem = useRef(activeItemId);
  const moveIndicator = useCallback((itemId: string | undefined, animate = false) => {
    const nav = navigation.current, marker = indicator.current;
    if (!nav || !marker) return;
    const link = Array.from(nav.querySelectorAll<HTMLElement>("[data-navigation-item]"))
      .find(item => item.dataset.navigationItem === itemId);
    if (!link || link.closest("[inert]") || !link.getClientRects().length) {
      marker.style.opacity = "0";
      return;
    }
    const top = link.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
    marker.style.height = `${link.offsetHeight}px`;
    nav.dataset.animatedSelection = "true";
    const previous = Number(marker.dataset.top ?? top);
    if (marker.dataset.top === String(top) && marker.style.opacity === "1") return;
    const from = getComputedStyle(marker).transform;
    const wasVisible = marker.style.opacity === "1";
    animation.current?.cancel();
    marker.style.transform = `translateY(${top}px)`;
    marker.style.opacity = "1";
    marker.dataset.top = String(top);
    if (animate && wasVisible && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const overshoot = Math.sign(top - previous) * Math.min(Math.abs(top - previous) * 0.04, 6);
      animation.current = marker.animate([
        { transform: from, offset: 0 },
        { transform: `translateY(${top + overshoot}px)`, offset: 0.75 },
        { transform: `translateY(${top}px)`, offset: 1 },
      ], { duration: 340, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }
  }, []);
  useLayoutEffect(() => {
    indicatorItem.current = activeItemId;
    moveIndicator(activeItemId, true);
  }, [activeItemId, moveIndicator]);
  useLayoutEffect(() => {
    const nav = navigation.current;
    if (!nav) return;
    const observer = new ResizeObserver(() => moveIndicator(indicatorItem.current));
    observer.observe(nav);
    const mobileMenu = nav.closest(".ah-mobile-navigation");
    if (mobileMenu) observer.observe(mobileMenu);
    nav.querySelectorAll("[data-navigation-section]").forEach(section => observer.observe(section));
    return () => { observer.disconnect(); animation.current?.cancel(); };
  }, [moveIndicator, sectionIds]);

  return (
    <aside {...props} className={[
      "ah-sidebar flex h-full min-h-0 w-[288px] max-w-full shrink-0 flex-col bg-sidebar text-light",
      className,
    ].filter(Boolean).join(" ")}>
      <div className="flex min-h-control-88 shrink-0 items-center gap-ah-12 px-ah-24">
        <BookIcon size={28} />
        <p className="min-w-0 text-[17px] leading-6 font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">Assessment Helper</p>
      </div>
      <nav ref={navigation} aria-label={navigationLabel} className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pt-ah-16 pb-ah-8">
        <span ref={indicator} aria-hidden="true" className="ah-navigation-indicator" style={{ opacity: 0 }} />
        {visibleSections.length ? visibleSections.map((section) => (
          <SidebarSection key={section.id} section={section} prefix={prefix} expanded={expandedSections[section.id] ?? false}
            onExpandedChange={onExpandedChange} activeItemId={activeItemId} onItemNavigate={(item) => {
              indicatorItem.current = item.id;
              moveIndicator(item.id, true);
              onItemNavigate?.(item);
            }} />
        )) : <p className="text-body [overflow-wrap:anywhere]">{emptyMessage}</p>}
      </nav>
      <footer className="flex min-h-control-88 shrink-0 items-center gap-ah-12 px-ah-24 py-ah-16">
        <Avatar initials={user?.initials} size={36} decorative />
        <div className={`flex min-h-ah-48 min-w-0 flex-1 flex-col gap-ah-4 [overflow-wrap:anywhere] ${centerProfileText ? "justify-center" : ""}`}>
          <p className="text-label">
            <span aria-hidden={accessibleName ? true : undefined}>{name}</span>
            {accessibleName && <span className="sr-only">{accessibleName}</span>}
          </p>
          {user?.description?.trim() && <p className="text-caption">{user.description}</p>}
        </div>
      </footer>
    </aside>
  );
}
