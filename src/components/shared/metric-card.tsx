import type { ComponentProps, ReactNode } from "react";

export type MetricCardProps = Omit<ComponentProps<"dl">, "children"> & {
  label: ReactNode;
  value?: number | string | null;
  tone?: "default" | "danger";
  loading?: boolean;
  error?: string | null;
  missingLabel?: string;
  loadingLabel?: string;
};

/** Display-only metric. An error takes precedence over loading and stale values. */
export function MetricCard({
  label,
  value,
  tone = "default",
  loading = false,
  error,
  missingLabel = "No data",
  loadingLabel = "Loading…",
  className,
  ...props
}: MetricCardProps) {
  const hasValue = typeof value === "number" ? Number.isFinite(value) : typeof value === "string" && value.trim() !== "";
  const showValue = !error && !loading && hasValue;
  const content = error || (loading ? loadingLabel : hasValue ? value : missingLabel);
  const contentClasses = showValue
    ? `text-metric ${tone === "danger" ? "text-danger" : "text-ink"}`
    : `text-body ${error ? "text-danger" : "text-muted"}`;

  return (
    <dl
      aria-busy={loading && !error || undefined}
      className={[
        "flex min-h-[148px] w-[262px] max-w-full flex-col items-start justify-center gap-ah-8 rounded-ah-8 border border-border bg-surface p-ah-24",
        className,
      ].filter(Boolean).join(" ")}
      {...props}
    >
      <dt className="w-full break-words text-body text-muted">{label}</dt>
      <dd className={`flex min-h-[67px] w-full items-center ${contentClasses}`} aria-live="polite" aria-atomic="true">
        <span className="min-w-0 break-words">{content}</span>
      </dd>
    </dl>
  );
}
