import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type TextActionButtonProps = ComponentProps<"button"> & { href?: never };
type TextActionLinkProps = ComponentProps<typeof Link> & { disabled?: never };

export type TextActionProps = (TextActionButtonProps | TextActionLinkProps) & {
  children: ReactNode;
};

function classes(className?: string) {
  return [
    "inline-flex min-h-9 min-w-[110px] items-center justify-center px-ah-12 text-label text-sidebar hover:text-active hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-sidebar disabled:hover:no-underline",
    className,
  ].filter(Boolean).join(" ");
}

/** Use href for navigation. Supply event handlers from a Client Component. */
export function TextAction(props: TextActionProps) {
  if (props.href !== undefined) {
    const { className, ...linkProps } = props;
    return <Link className={classes(className)} {...linkProps} />;
  }

  const { className, type = "button", ...buttonProps } = props;
  return <button type={type} className={classes(className)} {...buttonProps} />;
}
