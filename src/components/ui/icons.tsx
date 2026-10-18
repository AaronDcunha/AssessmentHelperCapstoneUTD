import type { ComponentProps, ReactNode } from "react";

type IconAppearanceProps = Omit<ComponentProps<"svg">,
  "children" | "width" | "height" | "viewBox" | "role" | "aria-hidden" | "aria-label" | "aria-labelledby" | "focusable" | "tabIndex"
> & {
  size?: number | string;
};

type IconAccessibilityProps =
  | { decorative?: true; "aria-label"?: never; "aria-labelledby"?: never }
  | { decorative?: false; "aria-label": string; "aria-labelledby"?: never }
  | { decorative?: false; "aria-label"?: never; "aria-labelledby": string };

/** Defaults to a decorative 24px icon. Supply a nonempty accessible name for a meaningful image.
 * Color inherits from the surrounding text or a semantic text-* class. Interactive behavior belongs to a button/link.
 */
export type IconProps = IconAppearanceProps & IconAccessibilityProps;

function SvgIcon({
  size = 24, className, decorative, "aria-label": label, "aria-labelledby": labelledBy, children, ...props
}: IconProps & { children: ReactNode }) {
  const hidden = decorative === true || !(label?.trim() || labelledBy?.trim());

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" {...props}
      width={size} height={size} viewBox="0 0 24 24" focusable="false"
      role={hidden ? undefined : "img"} aria-hidden={hidden ? true : undefined}
      aria-label={hidden ? undefined : label} aria-labelledby={hidden ? undefined : labelledBy}
      className={["inline-block shrink-0 align-middle", className].filter(Boolean).join(" ")}
    >
      {children}
    </svg>
  );
}

// Geometry transcribed directly from Figma Task 1 icon masters (24×24; 1.7px round strokes).

export function GridIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M4 3H8C8.55228 3 9 3.44772 9 4V8C9 8.55228 8.55228 9 8 9H4C3.44772 9 3 8.55228 3 8V4C3 3.44772 3.44772 3 4 3Z" />
      <path d="M16 3H20C20.5523 3 21 3.44772 21 4V8C21 8.55228 20.5523 9 20 9H16C15.4477 9 15 8.55228 15 8V4C15 3.44772 15.4477 3 16 3Z" />
      <path d="M4 15H8C8.55228 15 9 15.4477 9 16V20C9 20.5523 8.55228 21 8 21H4C3.44772 21 3 20.5523 3 20V16C3 15.4477 3.44772 15 4 15Z" />
      <path d="M16 15H20C20.5523 15 21 15.4477 21 16V20C21 20.5523 20.5523 21 20 21H16C15.4477 21 15 20.5523 15 20V16C15 15.4477 15.4477 15 16 15Z" />
    </SvgIcon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 5H19C20.1046 5 21 5.89543 21 7V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V7C3 5.89543 3.89543 5 5 5Z" />
      <path d="M16 3V7M8 3V7M3 11H21" />
    </SvgIcon>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" />
      <path d="M4 21V19C4 16.8783 4.84285 14.8434 6.34315 13.3431C7.84344 11.8429 9.87827 11 12 11C14.1217 11 16.1566 11.8429 17.6569 13.3431C19.1571 14.8434 20 16.8783 20 19V21H4Z" />
    </SvgIcon>
  );
}

export function PeopleIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 7C12 8.65685 10.6569 10 9 10C7.34315 10 6 8.65685 6 7C6 5.34315 7.34315 4 9 4C10.6569 4 12 5.34315 12 7Z" />
      <path d="M2 21V19C2 17.1435 2.7375 15.363 4.05025 14.0503C5.36301 12.7375 7.14348 12 9 12C10.8565 12 12.637 12.7375 13.9497 14.0503C15.2625 15.363 16 17.1435 16 19V21M17 4C17.7956 4 18.5587 4.31607 19.1213 4.87868C19.6839 5.44129 20 6.20435 20 7C20 7.79565 19.6839 8.55871 19.1213 9.12132C18.5587 9.68393 17.7956 10 17 10M19 14C19.8839 14.5096 20.6233 15.2362 21.1482 16.1111C21.6732 16.986 21.9663 17.9803 22 19V21" />
    </SvgIcon>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M7 5H17C18.1046 5 19 5.89543 19 7V19C19 20.1046 18.1046 21 17 21H7C5.89543 21 5 20.1046 5 19V7C5 5.89543 5.89543 5 7 5Z" />
      <path d="M10 2H14C14.5523 2 15 2.44772 15 3V6C15 6.55228 14.5523 7 14 7H10C9.44772 7 9 6.55228 9 6V3C9 2.44772 9.44772 2 10 2Z" />
    </SvgIcon>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M19 8V7L14 2H5V22H19V8ZM14 2V8H19M8 12H16M8 16H16" />
    </SvgIcon>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M5 21V12M12 21V7M19 21V3" />
    </SvgIcon>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 2L21 6V12C21 17 12 22 12 22C12 22 3 17 3 12V6L12 2Z" />
    </SvgIcon>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M12 21C15 18 19 18 22 20V4C19 2 15 2 12 5C9 2 5 2 2 4V20C5 18 9 18 12 21ZM12 5V21" />
    </SvgIcon>
  );
}

export function DownIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6 9L12 15L18 9" />
    </SvgIcon>
  );
}

export function UpIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M6 15L12 9L18 15" />
    </SvgIcon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M10 21H14M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 15 3 17H21C21 15 18 15 18 8Z" />
    </SvgIcon>
  );
}

