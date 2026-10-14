"use client";

import { useId, type ComponentProps, type ReactNode } from "react";

type FieldProps = {
  label: ReactNode;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
};

export type InputProps = ComponentProps<"input"> & FieldProps;
export type TextareaProps = ComponentProps<"textarea"> & FieldProps;
export type SelectProps = ComponentProps<"select"> & FieldProps;

const controlClasses = "w-full rounded-ah-8 border bg-surface px-ah-12 py-ah-12 text-body text-ink placeholder:text-muted disabled:cursor-not-allowed disabled:bg-neutral-bg disabled:text-muted read-only:bg-neutral-bg";

function useField({ id, hint, error, "aria-describedby": describedBy }: {
  id?: string; hint?: string; error?: string; "aria-describedby"?: string;
}) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return {
    id: fieldId,
    "aria-describedby": [describedBy, hint && `${fieldId}-hint`, error && `${fieldId}-error`].filter(Boolean).join(" ") || undefined,
  };
}

function Field({ id, label, hint, error, wrapperClassName, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={["flex flex-col gap-ah-8", wrapperClassName].filter(Boolean).join(" ")}>
      <label htmlFor={id} className="text-label text-ink">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-caption text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-caption text-danger" aria-live="polite">{error}</p>}
    </div>
  );
}

export function Input({ label, hint, error, wrapperClassName, className, ...props }: InputProps) {
  const field = useField({ ...props, hint, error });
  return (
    <Field {...{ label, hint, error, wrapperClassName }} id={field.id}>
      <input {...props} {...field} aria-invalid={error ? true : props["aria-invalid"]} className={[controlClasses, error ? "border-danger" : "border-border", className].filter(Boolean).join(" ")} />
    </Field>
  );
}

export function Textarea({ label, hint, error, wrapperClassName, className, rows = 4, ...props }: TextareaProps) {
  const field = useField({ ...props, hint, error });
  return (
    <Field {...{ label, hint, error, wrapperClassName }} id={field.id}>
      <textarea {...props} {...field} rows={rows} aria-invalid={error ? true : props["aria-invalid"]} className={[controlClasses, error ? "border-danger" : "border-border", className].filter(Boolean).join(" ")} />
    </Field>
  );
}

export function Select({ label, hint, error, wrapperClassName, className, children, ...props }: SelectProps) {
  const field = useField({ ...props, hint, error });
  return (
    <Field {...{ label, hint, error, wrapperClassName }} id={field.id}>
      <select {...props} {...field} aria-invalid={error ? true : props["aria-invalid"]} className={[controlClasses, error ? "border-danger" : "border-border", className].filter(Boolean).join(" ")}>
        {children}
      </select>
    </Field>
  );
}
