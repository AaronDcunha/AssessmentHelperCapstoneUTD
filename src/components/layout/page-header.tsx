import Link from "next/link";
import type { AriaAttributes, ComponentProps, MouseEventHandler, ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { BellIcon } from "@/components/ui/icons";

export type PageHeaderAction = {
  /** Full accessible action name; include the user's name for an account action. */
  label: string;
  "aria-controls"?: string;
  "aria-expanded"?: AriaAttributes["aria-expanded"];
  "aria-haspopup"?: AriaAttributes["aria-haspopup"];
} & (
  | { href: ComponentProps<typeof Link>["href"]; onClick?: never }
  | { onClick: MouseEventHandler<HTMLButtonElement>; href?: never }
);

export type PageHeaderProps = Omit<ComponentProps<"header">, "title" | "children"> & {
  title: string;
  subtitle?: string | null;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  notificationAction?: PageHeaderAction;
  /** Optional shared account dropdown, replacing the standalone avatar/action. */
  accountControl?: ReactNode;
  /** Reserve the Figma control positions without inventing actions or identity. */
  showUnavailableControls?: boolean;
  user?: {
    initials?: string | null;
    /** Accessible full name for a standalone avatar. */
    name: string;
    action?: PageHeaderAction;
  };
};

function HeaderAction({ action, children, className }: { action: PageHeaderAction; children: ReactNode; className: string }) {
  const props = {
    "aria-label": action.label,
    "aria-controls": action["aria-controls"],
    "aria-expanded": action["aria-expanded"],
    "aria-haspopup": action["aria-haspopup"],
    className: `inline-flex shrink-0 items-center justify-center text-ink transition-colors hover:bg-neutral-bg ${className}`,
  };

  return action.href !== undefined
    ? <Link {...props} href={action.href}>{children}</Link>
    : <button {...props} type="button" onClick={action.onClick}>{children}</button>;
}

/** Shared presentational page heading. The parent supplies identity and working actions. */
export function PageHeader({
  title, subtitle, headingLevel = 1, notificationAction, accountControl, showUnavailableControls = false, user, className, ...props
}: PageHeaderProps) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

  return (
    <header
      {...props}
      className={[
        "flex min-h-[80px] w-full flex-col gap-ah-16 sm:flex-row sm:items-start sm:justify-between sm:gap-ah-24",
        className,
      ].filter(Boolean).join(" ")}
    >
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <Heading className="text-title text-ink">{title}</Heading>
        {subtitle?.trim() && <p className="text-body text-muted">{subtitle}</p>}
      </div>
      {(notificationAction || user || accountControl || showUnavailableControls) && (
        <div className="flex h-ah-48 shrink-0 items-center gap-ah-24 self-end pr-ah-12 sm:self-start">
          {notificationAction && (
            <HeaderAction action={notificationAction} className="size-ah-24 rounded-ah-8">
              <BellIcon />
            </HeaderAction>
          )}
          {!notificationAction && showUnavailableControls && (
            <span className="inline-flex size-ah-24 items-center justify-center text-ink" role="img" aria-label="Notifications unavailable" title="Notifications unavailable">
              <BellIcon />
            </span>
          )}
          {accountControl ?? (user && (user.action ? (
            <HeaderAction action={user.action} className="size-ah-40 rounded-ah-pill">
              <Avatar initials={user.initials} decorative />
            </HeaderAction>
          ) : <Avatar initials={user.initials} aria-label={user.name} />))}
          {!accountControl && !user && showUnavailableControls && <Avatar aria-label="User information unavailable" />}
        </div>
      )}
    </header>
  );
}
