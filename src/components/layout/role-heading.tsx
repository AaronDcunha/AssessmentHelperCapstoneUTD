"use client";

import type { ComponentProps, ReactNode } from "react";
import { DownIcon, UpIcon } from "@/components/ui/icons";

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
  label, icon, expanded, onExpandedChange, "aria-controls": controls, className, ...props
}: RoleHeadingProps) {
  const Chevron = expanded ? UpIcon : DownIcon;

  return (
    <button
      {...props}
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={() => onExpandedChange(!expanded)}
      className={[
        "flex min-h-ah-64 w-[256px] max-w-full cursor-pointer items-center gap-ah-12 rounded-ah-0 p-ah-8 text-left text-label text-light transition-colors hover:bg-active focus-visible:outline-light disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ].filter(Boolean).join(" ")}
    >
      <span aria-hidden="true" className="flex size-ah-24 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-h-ah-40 min-w-0 flex-1 [overflow-wrap:anywhere]">{label}</span>
      <Chevron />
    </button>
  );
}
