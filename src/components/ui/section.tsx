"use client";

import { useId, type ComponentProps, type ReactNode } from "react";

export type SectionProps = Omit<ComponentProps<"section">, "title"> & {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  contentClassName?: string;
  variant?: "card" | "plain";
};

/** Shared card section: pages supply content; borders, spacing and headings stay consistent. */
export function Section({
  title,
  eyebrow,
  description,
  actions,
  headingLevel = 2,
  className,
  contentClassName,
  variant = "card",
  children,
  "aria-labelledby": labelledBy,
  ...props
}: SectionProps) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

  return (
    <section
      {...props}
      aria-labelledby={labelledBy ?? headingId}
      className={[variant === "card" && "rounded-ah-12 border border-border bg-surface p-ah-24", className].filter(Boolean).join(" ")}
    >
      <div className="mb-ah-16 flex flex-wrap items-start justify-between gap-ah-16">
        <div className="min-w-0 space-y-ah-8">
          {eyebrow && <p className="text-body text-ink">{eyebrow}</p>}
          <Heading id={headingId} className="text-section text-ink">{title}</Heading>
          {description && <p className="text-body text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-ah-12">{actions}</div>}
      </div>
      <div className={contentClassName}>{children}</div>
    </section>
  );
}
