import type { ComponentProps, ReactNode } from "react";

const paginationGroup = "inline-flex items-stretch divide-x divide-border overflow-hidden rounded-ah-8 border border-border bg-surface";
const paginationControl = "inline-flex h-11 min-w-11 items-center justify-center px-ah-8 text-ink tabular-nums enabled:hover:bg-neutral-bg focus-visible:outline-offset-[-3px] disabled:cursor-not-allowed disabled:opacity-40";

export type TablePaginationProps = {
  page: number;
  pageSize: number;
  pageSizes?: readonly number[];
  rowsShown: number | null;
  totalRows?: number;
  itemLabel?: { singular: string; plural: string };
  summaryDetail?: ReactNode;
  hasNextPage?: boolean;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export function TablePagination({
  page, pageSize, pageSizes = [10, 25, 50], rowsShown, totalRows, hasNextPage,
  itemLabel = { singular: "result", plural: "results" },
  summaryDetail, disabled, onPageChange, onPageSizeChange,
}: TablePaginationProps) {
  const hasNext = hasNextPage ?? (totalRows !== undefined && page * pageSize < totalRows);
  const empty = rowsShown === 0;
  const pageLabel = empty ? "0 / 0" : totalRows === undefined ? `Page ${page}` : `${page} / ${Math.ceil(totalRows / pageSize)}`;
  const summary = rowsShown === null ? null :
    `${rowsShown}${totalRows === undefined ? "" : ` of ${totalRows}`} ${(totalRows ?? rowsShown) === 1 ? itemLabel.singular : itemLabel.plural}`;

  return <nav aria-label="Table pagination" className="flex flex-wrap items-center justify-between gap-ah-12 border-t border-border bg-surface px-ah-8 py-ah-8 text-label text-muted min-[380px]:px-ah-16 sm:px-ah-24">
    <div role="status" className="flex flex-wrap items-baseline gap-x-ah-8 gap-y-ah-4">
      <span>{summary}</span>
      {summaryDetail && <><span aria-hidden="true">·</span><span>{summaryDetail}</span></>}
      {rowsShown !== null && rowsShown > 0 && <span className="sr-only">Page {page}</span>}
    </div>
    <div className="flex flex-wrap items-center gap-x-ah-16 gap-y-ah-8">
      <div role="group" aria-label="Rows per page" className="flex flex-wrap items-center gap-ah-8">
        <span aria-hidden="true">Rows</span>
        <div className={paginationGroup}>
          {pageSizes.map(size => <button key={size} type="button" aria-pressed={size === pageSize}
            disabled={disabled || empty}
            className={`${paginationControl} aria-pressed:bg-light aria-pressed:text-sidebar aria-pressed:enabled:hover:bg-light`}
            onClick={() => { if (size !== pageSize) onPageSizeChange(size); }}>{size}</button>)}
        </div>
      </div>
      <div className={paginationGroup}>
        <button type="button" aria-label="Previous" className={paginationControl} disabled={disabled || empty || page <= 1} onClick={() => onPageChange(page - 1)}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m10 3-5 5 5 5" /></svg>
        </button>
        <span aria-hidden="true" className="inline-flex items-center whitespace-nowrap px-ah-8 tabular-nums">{pageLabel}</span>
        <button type="button" aria-label="Next" className={paginationControl} disabled={disabled || empty || !hasNext} onClick={() => onPageChange(page + 1)}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      </div>
    </div>
  </nav>;
}

export function Table({ pagination, regionProps, ...props }: ComponentProps<"table"> & {
  pagination?: TablePaginationProps;
  regionProps?: ComponentProps<"div">;
}) {
  const table = <table {...props} />;
  const content = regionProps ? <div {...regionProps}>{table}</div> : table;
  if (!pagination) return content;

  return <div className="overflow-hidden rounded-ah-8 border border-border bg-surface">
    {content}
    <TablePagination {...pagination} />
  </div>;
}

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
