import Link from "next/link";
import type { ComponentProps } from "react";

type Appearance = {
  variant?: "primary" | "secondary" | "danger";
  fullWidth?: boolean;
};

export type ButtonProps = ComponentProps<"button"> & Appearance & { href?: never };
export type ButtonLinkProps = ComponentProps<typeof Link> & Appearance;

function classes({ variant = "primary", fullWidth, className }: Appearance & { className?: string }) {
  const variants = {
    primary: "border-sidebar bg-sidebar text-light hover:bg-active focus-visible:outline-accent",
    secondary: "border-border bg-surface text-ink hover:bg-neutral-bg",
    danger: "border-danger bg-danger text-surface hover:opacity-90",
  };
  return [
    "inline-flex min-h-11 items-center justify-center gap-ah-8 rounded-ah-8 border px-ah-16 py-ah-12 text-label transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant], fullWidth && "w-full", className,
  ].filter(Boolean).join(" ");
}

/** Defaults to a non-submitting button; use type="submit" for form submission. */
export function Button({ variant, fullWidth, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={classes({ variant, fullWidth, className })} {...props} />;
}

/** Navigation uses an actual link, preserving keyboard and open-in-new-tab behavior. */
export function ButtonLink({ variant, fullWidth, className, ...props }: ButtonLinkProps) {
  return <Link className={classes({ variant, fullWidth, className })} {...props} />;
}
