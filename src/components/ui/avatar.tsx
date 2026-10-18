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

const segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
  ? new Intl.Segmenter("en", { granularity: "grapheme" })
  : undefined;

// Fixed ranges keep common accent/emoji boundaries independent of runtime Unicode tables.
// This is a compact initials scanner, not a full implementation of Unicode grapheme rules.
const continuation = /[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f\ufe00-\ufe0f\u{1f3fb}-\u{1f3ff}\u{e0020}-\u{e007f}\u{e0100}-\u{e01ef}]/u;

function initialUnits(text: string): string[] {
  // Native boundaries for plain letters/digits are unambiguous. Unicode input always
  // uses the same scanner on server and client, even when Segmenter is available.
  if (segmenter && /^[a-z0-9]+$/i.test(text)) {
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  }

  const units: string[] = [];
  let regionalIndicators = 0;
  for (const point of text) {
    const code = point.codePointAt(0)!;
    const regional = code >= 0x1f1e6 && code <= 0x1f1ff;
    const last = units.length - 1;
    if (last >= 0 && (continuation.test(point) || point === "\u200d" || units[last].endsWith("\u200d") || (regional && regionalIndicators % 2 === 1))) {
      units[last] += point;
    } else {
      units.push(point);
    }
    regionalIndicators = regional ? regionalIndicators + 1 : 0;
  }
  return units;
}

function abbreviate(initials: string | null | undefined) {
  const words = typeof initials === "string" ? initials.normalize("NFC").trim().split(/\s+/u).filter(Boolean) : [];
  const first = (word: string) => initialUnits(word)[0] ?? "";
  const text = words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : words[0] ?? "";
  return initialUnits(text.toUpperCase()).slice(0, 2).join("");
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
