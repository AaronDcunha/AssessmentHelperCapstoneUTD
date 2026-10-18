"use client";

import { useId, useLayoutEffect, useRef, type ComponentProps } from "react";
import { Avatar } from "@/components/ui/avatar";
import { BookIcon } from "@/components/ui/icons";
import { NavigationItem } from "./navigation-item";
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
    <div className="min-w-0 space-y-ah-16" data-navigation-section={section.id}>
      <RoleHeading ref={headingRef} label={section.label} icon={<Icon />}
        expanded={expanded} onExpandedChange={(next) => onExpandedChange(section.id, next)} aria-controls={panelId} />
      <ul ref={panelRef} id={panelId} hidden={!expanded} className="space-y-ah-8">
        {section.items.map((item) => {
          const ItemIcon = navigationIcons[item.icon];
          return (
            <li key={item.id}>
              <NavigationItem label={item.label} href={item.href} icon={<ItemIcon />}
                active={item.id === activeItemId} onNavigate={() => onItemNavigate?.(item)} data-navigation-item={item.id} />
            </li>
          );
        })}
      </ul>
      <div aria-hidden="true" className="h-px bg-active" />
    </div>
  );
}

/** One sidebar for any combination of authorized sections. No identity fetching or role grants. */
export function Sidebar({
  authorizedSections, sections, canAccess, expandedSections, onExpandedChange, activeItemId, onItemNavigate,
  user, missingUserLabel = "User information unavailable", navigationLabel = "Main navigation",
  emptyMessage = "No navigation available.", className, ...props
}: SidebarProps) {
  const prefix = useId();
  const visibleSections = filterNavigation(authorizedSections ?? sections ?? [], authorizedSections !== undefined ? () => true : canAccess ?? (() => false));
  const name = user?.name?.trim() || missingUserLabel;
  const accessibleName = user?.accessibleName?.trim();

  return (
    <aside {...props} className={[
      "flex min-h-[960px] w-[288px] max-w-full shrink-0 flex-col gap-ah-16 bg-sidebar p-ah-16 text-light",
      className,
    ].filter(Boolean).join(" ")}>
      <div className="flex min-h-control-88 shrink-0 items-center gap-ah-16">
        <BookIcon />
        <p className="min-w-0 text-brand [overflow-wrap:anywhere]">Assessment<br />Helper</p>
      </div>
      <div aria-hidden="true" className="h-px shrink-0 bg-active" />
      <nav aria-label={navigationLabel} className="w-full min-w-0 space-y-ah-16">
        {visibleSections.length ? visibleSections.map((section) => (
          <SidebarSection key={section.id} section={section} prefix={prefix} expanded={expandedSections[section.id] ?? false}
            onExpandedChange={onExpandedChange} activeItemId={activeItemId} onItemNavigate={onItemNavigate} />
        )) : <p className="text-body [overflow-wrap:anywhere]">{emptyMessage}</p>}
      </nav>
      <div aria-hidden="true" className="min-h-px flex-1" />
      <footer className="flex min-h-ah-64 shrink-0 items-center gap-ah-12">
        <Avatar initials={user?.initials} decorative />
        <div className="flex min-h-ah-48 min-w-0 flex-1 flex-col gap-ah-4 [overflow-wrap:anywhere]">
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
