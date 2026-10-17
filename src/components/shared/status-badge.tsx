import type { ComponentProps } from "react";

export type StatusBadgeStatus = "overdue" | "unmatched" | "incomplete";

export type StatusBadgeProps = ComponentProps<"span"> & {
  status: StatusBadgeStatus;
};

const statuses = {
  overdue: { label: "Overdue", classes: "bg-danger-bg text-danger" },
  unmatched: { label: "Unmatched", classes: "bg-warning-bg text-warning" },
  incomplete: { label: "Incomplete", classes: "bg-neutral-bg text-ink" },
};

/** Displays a supplied status; eligibility and workflow rules belong on the server. */
export function StatusBadge({ status, className, children, ...props }: StatusBadgeProps) {
  return (
    <span
      className={[
        "inline-flex min-h-ah-32 min-w-[120px] items-center justify-center rounded-ah-pill px-ah-12 text-label",
        statuses[status].classes,
        className,
      ].filter(Boolean).join(" ")}
      {...props}
    >
      {children ?? statuses[status].label}
    </span>
  );
}
