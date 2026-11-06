"use client";

import type { ComponentProps, ReactNode } from "react";
import { DownIcon } from "@/components/ui/icons";

export type RoleHeadingProps = Omit<ComponentProps<"button">,
  "children" | "type" | "onClick" | "aria-expanded" | "aria-controls"
> & {
  label: string;
  /** Noninteractive role icon, normally a shared decorative 24px icon. */
  icon: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** ID of the navigation panel whose visibility is controlled by the parent. */
  "aria-controls": string;
};

/** Controlled sidebar disclosure. The parent owns state, panel markup, and permissions. */
export function RoleHeading({
  label, icon: _icon, expanded, onExpandedChange, "aria-controls": controls, className, ...props
}: RoleHeadingProps) {
  // Keep the shared icon prop compatible; the compact disclosure uses its chevron instead.
  void _icon;
  return (
    <button
      {...props}
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={() => onExpandedChange(!expanded)}
      className={[
        "ah-role-heading flex min-h-[44px] w-full cursor-pointer items-center gap-ah-12 rounded-ah-8 px-ah-8 py-ah-12 text-left text-label font-semibold text-light transition-colors hover:bg-active focus-visible:outline-light disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ].filter(Boolean).join(" ")}
    >
      <DownIcon size={16} className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${expanded ? "" : "-rotate-90"}`} />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{label}</span>
    </button>
  );
}
