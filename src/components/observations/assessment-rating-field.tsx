"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/form-fields";

export type AssessmentRatingOption = {
  value: number;
  label: string;
  disabled?: boolean;
  /** Optional presentation override, for example a wider tile for a long label. */
  className?: string;
};

export type AssessmentRatingFieldProps = Omit<ComponentProps<"div">, "children" | "onChange"> & {
  label: ReactNode;
  options: readonly AssessmentRatingOption[];
  value: number | null;
  onChange: (value: number) => void;
  /** Use a distinct name for each question. An instance-specific name is generated otherwise. */
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  hint?: string;
  /** Parent validation supplies the message; native required validation is also supported. */
  error?: string;
};

const tileClasses = [
  "relative min-w-[124px] max-w-full",
  "[&>label]:flex [&>label]:min-h-[52px] [&>label]:cursor-pointer [&>label]:items-center [&>label]:justify-center",
  "[&>label]:rounded-ah-8 [&>label]:border [&>label]:border-border [&>label]:bg-surface [&>label]:p-ah-12 [&>label]:text-center [&>label]:text-sidebar [&>label]:break-words",
  "[&:has(input:checked)>label]:border-sidebar [&:has(input:checked)>label]:bg-sidebar [&:has(input:checked)>label]:text-light",
  "[&:has(input:focus-visible)>label]:outline-2 [&:has(input:focus-visible)>label]:outline-offset-2 [&:has(input:focus-visible)>label]:outline-sidebar",
  "[&:has(input:checked):has(input:focus-visible)>label]:outline-accent",
  "[&:has(input:disabled)>label]:cursor-not-allowed [&:has(input:disabled)>label]:opacity-50",
].join(" ");

/** Controlled, template-driven rating. No scale, saved answer, or submission logic is owned here.
 * Read-only groups retain focus/form values, block selection changes, and skip native required validation.
 */
export function AssessmentRatingField({
  label, options, value, onChange, name, required = false, disabled = false, readOnly = false,
  hint, error, className, "aria-describedby": describedBy, ...props
}: AssessmentRatingFieldProps) {
  const id = useId();
  const groupName = name ?? `${id}-rating`;
  const invalidScale = options.some((option) => !Number.isFinite(option.value) || !option.label.trim())
    || new Set(options.map((option) => option.value)).size !== options.length;
  const message = error
    || (invalidScale ? "Rating options must have unique finite numeric values and nonempty labels." : undefined)
    || (options.length === 0 ? "No rating options are available." : undefined)
    || (value !== null && !options.some((option) => option.value === value) ? "The selected rating is not in this template scale. Choose an available rating." : undefined);
  const description = [describedBy, hint && `${id}-hint`, message && `${id}-error`].filter(Boolean).join(" ") || undefined;

  return (
    <div
      {...props} role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={description}
      aria-required={required || undefined} aria-invalid={message ? true : undefined}
      aria-readonly={readOnly || undefined} aria-disabled={disabled || invalidScale || undefined}
      className={["min-w-0", className].filter(Boolean).join(" ")}
    >
      <div className="flex min-w-0 flex-col gap-ah-12 xl:flex-row xl:items-start">
        <p id={`${id}-label`} className="min-w-0 break-words text-body text-ink xl:flex xl:min-h-[52px] xl:w-[310px] xl:shrink-0 xl:items-center">
          {label}{required && <span className="sr-only"> (required)</span>}
        </p>
        <div className="flex min-w-0 flex-wrap gap-ah-12">
          {options.map((option, index) => (
            <Input
              key={`${option.value}-${index}`} id={`${id}-option-${index}`} type="radio" name={groupName}
              label={<span className="min-w-0 break-words">{option.value} · {option.label}</span>}
              value={String(option.value)} checked={value === option.value} required={required && !readOnly}
              disabled={disabled || invalidScale || option.disabled} aria-invalid={message ? true : undefined} aria-describedby={description}
              // Keep Aaron's field/label association while presenting the native input as a tile.
              className="sr-only w-px! border-0! p-ah-0!"
              wrapperClassName={[
                tileClasses,
                readOnly ? "[&>label]:cursor-default" : "[&:has(input:enabled)>label:hover]:bg-neutral-bg [&:has(input:enabled):has(input:checked)>label:hover]:bg-active",
                option.className,
              ].filter(Boolean).join(" ")}
              onClick={(event) => { if (readOnly) event.preventDefault(); }}
              onKeyDown={(event) => {
                if (readOnly && [" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) event.preventDefault();
              }}
              onChange={(event) => {
                if (event.target.checked && !disabled && !readOnly && !invalidScale && !option.disabled) onChange(option.value);
              }}
            />
          ))}
        </div>
      </div>
      {hint && <p id={`${id}-hint`} className="mt-ah-8 text-caption text-muted">{hint}</p>}
      {message && <p id={`${id}-error`} role="alert" className="mt-ah-8 text-caption text-danger">{message}</p>}
    </div>
  );
}
