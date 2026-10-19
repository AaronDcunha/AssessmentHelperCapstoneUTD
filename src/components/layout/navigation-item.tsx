import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export type NavigationItemProps = Omit<ComponentProps<typeof Link>, "children" | "aria-current"> & {
  label: string;
  /** Supply a noninteractive, decorative icon (normally a shared 24px icon). */
  icon: ReactNode;
  /** Explicit destination state. The parent owns route matching; defaults to false. */
  active?: boolean;
};

/** Presentational sidebar link. A single-line item is 248x44px; long labels wrap and grow. */
export function NavigationItem({ label, icon, active = false, className, ...props }: NavigationItemProps) {
  return (
    <Link
      {...props}
      aria-current={active ? "page" : undefined}
      className={[
        "relative flex min-h-[44px] w-[248px] max-w-full items-center gap-ah-12 rounded-ah-8 px-ah-12 py-ah-8 text-body text-light transition-colors hover:bg-active focus-visible:outline-light",
        active && "bg-active",
        className,
      ].filter(Boolean).join(" ")}
    >
      <span aria-hidden="true" className="flex size-ah-24 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
      {active && <span aria-hidden="true" className="absolute left-ah-0 top-ah-8 h-[28px] w-ah-4 bg-accent" />}
    </Link>
  );
}

/** A known destination with no implemented route. Never renders an invented URL. */
export function UnavailableNavigationItem({ label, icon, reason }: { label: string; icon: ReactNode; reason: string }) {
  return (
    <span role="link" aria-disabled="true" tabIndex={0} aria-label={`${label}. ${reason}`} title={reason}
      className="relative flex min-h-[44px] w-[248px] max-w-full cursor-not-allowed items-center gap-ah-12 rounded-ah-8 px-ah-12 py-ah-8 text-body text-light opacity-70 focus-visible:outline-light">
      <span aria-hidden="true" className="flex size-ah-24 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
    </span>
  );
}
