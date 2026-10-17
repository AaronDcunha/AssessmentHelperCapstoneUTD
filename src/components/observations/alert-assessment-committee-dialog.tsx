"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form-fields";

export type AssessmentCommitteeAlertValues = { reason: string; details: string };
export type AssessmentCommitteeAlertReason = { value: string; label: string; disabled?: boolean };
export type AssessmentCommitteeAlertStatus = "idle" | "pending" | "success" | "error";
export type AssessmentCommitteeAlertFieldErrors = Partial<Record<keyof AssessmentCommitteeAlertValues, string>>;

export type AlertAssessmentCommitteeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: AssessmentCommitteeAlertValues;
  onChange: (value: AssessmentCommitteeAlertValues) => void;
  reasonOptions: readonly AssessmentCommitteeAlertReason[];
  /** The parent handles the request and supplies status/errors; this component never sends notifications. */
  onSubmit: (value: AssessmentCommitteeAlertValues) => void;
  /** Called for Cancel/Escape, including while pending. The parent owns request cancellation. */
  onCancel: () => void;
  status?: AssessmentCommitteeAlertStatus;
  fieldErrors?: AssessmentCommitteeAlertFieldErrors;
  error?: string;
  /** Whether details are required is a caller decision, not a backend policy defined here. */
  detailsRequired?: boolean;
  contextDescription?: string;
  successMessage?: string;
};

/** Keep mounted in a Client Component. Parent owns open, form values, and submission state.
 * Reason values must be unique and nonempty. Closing leaves parent-owned values untouched.
 */
export function AlertAssessmentCommitteeDialog({ open, ...props }: AlertAssessmentCommitteeDialogProps) {
  // Mount a fresh interaction session on every opening without resetting parent-owned values.
  return open ? <OpenAlertAssessmentCommitteeDialog {...props} /> : null;
}

function OpenAlertAssessmentCommitteeDialog({
  onOpenChange, value, onChange, reasonOptions, onSubmit, onCancel,
  status = "idle", fieldErrors, error, detailsRequired = false,
  contextDescription = "Your observation and candidate list will be included with the alert.",
  successMessage = "Your alert has been sent. An alert is now pending for this observation.",
}: Omit<AlertAssessmentCommitteeDialogProps, "open">) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [attempted, setAttempted] = useState(false);
  const pending = status === "pending";
  const success = status === "success";
  const validReason = reasonOptions.some((option) => option.value !== "" && option.value === value.reason && !option.disabled);
  const reasonError = fieldErrors?.reason || (attempted && !validReason ? "Choose an available reason." : undefined);
  const detailsError = fieldErrors?.details || (attempted && detailsRequired && !value.details.trim() ? "Enter details." : undefined);
  const submissionError = error || (status === "error" ? "The alert could not be sent. Please try again." : undefined);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    element.querySelector<HTMLSelectElement>("select:not(:disabled)")?.focus();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (success) heading.current?.focus();
    else if (pending) cancelButton.current?.focus();
    else if (submissionError) errorMessage.current?.focus();
  }, [success, pending, submissionError]);

  function close() {
    if (!success) onCancel();
    onOpenChange(false);
  }

  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), textarea:not(:disabled)");
    if (!controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    const insideControls = Array.from(controls).some((control) => control === active);
    if (event.shiftKey && (active === first || !insideControls)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !insideControls)) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <dialog
      ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      className="m-auto max-h-[calc(100dvh_-_2rem)] w-[560px] max-w-[calc(100%_-_2rem)] overflow-y-auto rounded-ah-8 border border-border bg-surface p-ah-24 text-ink backdrop:bg-ink/40"
      onCancel={(event) => { event.preventDefault(); close(); }} onKeyDown={keepFocusInside}
    >
      <div className="flex min-w-0 flex-col gap-ah-16">
        <h2 ref={heading} id={`${id}-title`} tabIndex={-1} className="break-words text-section">
          {success ? "Assessment Committee notified" : "Alert Assessment Committee"}
        </h2>
        <p id={`${id}-description`} className="break-words text-body">
          {success ? successMessage : "Tell the committee what is preventing you from arranging your observation."}
        </p>
        {success ? (
          <Button variant="secondary" className="h-11 w-[200px] max-w-full py-ah-0! text-sidebar" onClick={close}>Close</Button>
        ) : (
          <form
            noValidate aria-busy={pending || undefined} className="flex min-w-0 flex-col gap-ah-16"
            onSubmit={(event) => {
              event.preventDefault();
              if (pending) return;
              setAttempted(true);
              if (!validReason || fieldErrors?.reason) {
                dialog.current?.querySelector<HTMLSelectElement>("select")?.focus();
                return;
              }
              if ((detailsRequired && !value.details.trim()) || fieldErrors?.details) {
                dialog.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
                return;
              }
              onSubmit({ ...value });
            }}
          >
            <Select
              name="reason" label="Reason" value={value.reason} required disabled={pending}
              error={reasonError} wrapperClassName="min-h-control-88"
              className={`h-control-56 px-ah-16 py-ah-16 enabled:bg-surface! ${!value.reason ? "text-muted!" : ""}`}
              onChange={(event) => { if (!pending) onChange({ ...value, reason: event.target.value }); }}
            >
              <option value="" disabled>Choose a reason</option>
              {reasonOptions.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
            </Select>
            {reasonOptions.every((option) => !option.value || option.disabled) && (
              <p role="status" className="text-caption text-muted">No reasons are available. Try again when reason options are available.</p>
            )}
            <Textarea
              name="details" label="Details" value={value.details} required={detailsRequired} disabled={pending}
              placeholder="Explain the issue with candidates or accepted dates…" error={detailsError}
              rows={2} wrapperClassName="min-h-[160px]" className="h-control-88 min-h-control-88 resize-y px-ah-16 py-ah-16"
              onChange={(event) => { if (!pending) onChange({ ...value, details: event.target.value }); }}
            />
            <p className="text-caption text-muted">{contextDescription}</p>
            {submissionError && <p ref={errorMessage} role="alert" tabIndex={-1} className="break-words text-body text-danger">{submissionError}</p>}
            <div className="flex flex-wrap gap-ah-16">
              <Button ref={cancelButton} variant="secondary" className="h-11 w-[160px] max-w-full py-ah-0! text-sidebar" onClick={close}>Cancel</Button>
              <Button type="submit" className="h-11 w-[200px] max-w-full py-ah-0!" disabled={pending}>{pending ? "Sending…" : "Send Alert"}</Button>
            </div>
          </form>
        )}
        {pending && <p role="status" className="text-caption text-muted">Sending alert…</p>}
      </div>
    </dialog>
  );
}
