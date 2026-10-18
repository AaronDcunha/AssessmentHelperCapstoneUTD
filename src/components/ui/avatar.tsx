import type { ComponentProps } from "react";
import { PersonIcon } from "./icons";

type AvatarAppearanceProps = Omit<ComponentProps<"span">,
  "children" | "role" | "aria-hidden" | "aria-label" | "aria-labelledby" | "tabIndex"
> & {
  initials?: string | null;
  /** Positive pixel diameter. Invalid sizes fall back to Figma's 40px reference. */
  size?: number;
};

type AvatarAccessibilityProps =
  | { decorative?: true; "aria-label"?: never; "aria-labelledby"?: never }
  | { decorative?: false; "aria-label": string; "aria-labelledby"?: never }
  | { decorative?: false; "aria-label"?: never; "aria-labelledby": string };

export type AvatarProps = AvatarAppearanceProps & AvatarAccessibilityProps;

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

function abbreviate(initials: string | null | undefined) {
  const words = typeof initials === "string" ? initials.normalize("NFC").trim().split(/\s+/u).filter(Boolean) : [];
  const first = (word: string) => segmenter.segment(word)[Symbol.iterator]().next().value?.segment ?? "";
  const text = words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : words[0] ?? "";
  return [...segmenter.segment(text.toUpperCase())].slice(0, 2).map(({ segment }) => segment).join("");
}

/** Presentational avatar for headers/sidebars. Supply an accessible name only when the avatar
 * conveys identity independently; leave it decorative beside a visible name or inside a named control.
 */
export function Avatar({
  initials, size = 40, decorative, "aria-label": label, "aria-labelledby": labelledBy,
  className, style, ...props
}: AvatarProps) {
  const diameter = Number.isFinite(size) && size > 0 ? size : 40;
  const text = abbreviate(initials);
  const hidden = decorative === true || !(label?.trim() || labelledBy?.trim());
  const scale = diameter / 40;

  return (
    <span
      {...props} role={hidden ? undefined : "img"} aria-hidden={hidden ? true : undefined}
      aria-label={hidden ? undefined : label} aria-labelledby={hidden ? undefined : labelledBy}
      className={["inline-flex shrink-0 items-center justify-center overflow-hidden rounded-ah-pill bg-light text-label text-sidebar", className].filter(Boolean).join(" ")}
      style={{ width: diameter, height: diameter, ...style }}
    >
      {text ? (
        <span
          aria-hidden="true" className="max-w-[80%] overflow-hidden whitespace-nowrap text-center"
          style={diameter === 40 ? undefined : {
            fontSize: `calc(var(--text-label) * ${scale})`,
            lineHeight: `calc(var(--text-label--line-height) * ${scale})`,
          }}
        >{text}</span>
      ) : <PersonIcon size="60%" />}
    </span>
  );
}
