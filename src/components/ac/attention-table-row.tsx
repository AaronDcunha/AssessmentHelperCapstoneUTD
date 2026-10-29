import type { ComponentProps } from "react";
import { StatusBadge, type StatusBadgeStatus } from "@/components/shared/status-badge";
import { TableCell } from "@/components/ui/table";
import { TextAction, type TextActionProps } from "@/components/ui/text-action";

export type AttentionReviewAction = {
  label?: string;
  ariaLabel?: string;
} & (
  | { href: NonNullable<TextActionProps["href"]>; onClick?: never; disabled?: never }
  | { href?: never; onClick: NonNullable<ComponentProps<"button">["onClick"]>; disabled?: boolean }
);

export type AttentionTableRowProps = Omit<ComponentProps<"tr">, "children"> & {
  faculty?: string | null;
  issueStatus?: StatusBadgeStatus | null;
  /** Display text supplied by the caller; no lifecycle state is inferred here. */
  observationStatus?: string | null;
  action?: AttentionReviewAction | null;
};

// Native cell alignment centers the 36px content within the 68px row.
const cellClasses = "h-[68px]! py-ah-0! [&>div]:flex [&>div]:min-h-9 [&>div]:items-center";

function missing(field: string) {
  return <span className="relative text-muted"><span aria-hidden="true">—</span><span className="sr-only">{field} not provided</span></span>;
}

/** Render in tbody beneath Faculty / Issue / Observation status / Action headers.
 * Parent supplies authorized data and review destinations; callbacks require a Client Component.
 */
export function AttentionTableRow({ faculty, issueStatus, observationStatus, action, className, ...props }: AttentionTableRowProps) {
  const facultyName = faculty?.trim();
  const statusText = observationStatus?.trim();
  const hasIssue = issueStatus === "overdue" || issueStatus === "unmatched" || issueStatus === "incomplete" || issueStatus === "alert";
  const actionLabel = action?.label?.trim() || "Review →";
  const actionAriaLabel = action?.ariaLabel?.trim() || `${actionLabel}${facultyName ? ` for ${facultyName}` : " faculty record"}`;
  const hasHref = action?.href != null && (typeof action.href !== "string" || action.href.trim() !== "");

  return (
    <tr className={["h-[68px] border border-border bg-surface", className].filter(Boolean).join(" ")} {...props}>
      <TableCell className={`${cellClasses} w-[384px]! pl-ah-24! pr-ah-0!`}>
        {facultyName ? <span className="min-w-0 break-words">{facultyName}</span> : missing("Faculty")}
      </TableCell>
      <TableCell className={`${cellClasses} w-[288px]! px-ah-0!`}>
        {hasIssue ? <StatusBadge status={issueStatus} /> : missing("Issue")}
      </TableCell>
      <TableCell className={`${cellClasses} w-[210px]! px-ah-0!`}>
        {statusText ? <span className="min-w-0 break-words">{statusText}</span> : missing("Observation status")}
      </TableCell>
      <TableCell className={`${cellClasses} w-[214px]! pl-ah-0! pr-ah-24!`}>
        {hasHref && action?.href != null ? (
          <TextAction href={action.href} aria-label={actionAriaLabel}>{actionLabel}</TextAction>
        ) : action?.onClick ? (
          <TextAction onClick={action.onClick} disabled={action.disabled} aria-label={actionAriaLabel}>{actionLabel}</TextAction>
        ) : (
          <TextAction disabled aria-label={`${actionAriaLabel} (unavailable)`}>{actionLabel}</TextAction>
        )}
      </TableCell>
    </tr>
  );
}
