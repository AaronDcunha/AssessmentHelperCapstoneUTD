import type { ComponentProps } from "react";

export type TableCellProps =
  | (ComponentProps<"th"> & { variant: "header" })
  | (ComponentProps<"td"> & { variant?: "body" });

/** Render inside a table row; use scope="row" for row headings. */
export function TableCell({ variant = "body", className, children, ...props }: TableCellProps) {
  const cellClasses = [
    "h-control-56 w-[200px] p-ah-12 text-left align-middle",
    variant === "header" ? "bg-canvas text-label text-muted" : "bg-surface text-body text-ink",
    className,
  ].filter(Boolean).join(" ");
  const content = <div className="min-h-ah-32">{children}</div>;

  return variant === "header"
    ? <th scope="col" className={cellClasses} {...props}>{content}</th>
    : <td className={cellClasses} {...props}>{content}</td>;
}
