import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { calendarDateLabel, parseCalendarDate } from "@/lib/calendar-date";

export type ProposedDateOptionProps = Omit<ComponentProps<"div">, "children"> & {
  date: string;
  meetingTime: string;
  onRemove: () => void;
  disabled?: boolean;
  /** Pass Person 1's shared Calendar icon when it is available. */
  calendarIcon?: ReactNode;
};

export function ProposedDateOption({ date, meetingTime, onRemove, disabled = false, calendarIcon, className, ...props }: ProposedDateOptionProps) {
  const label = calendarDateLabel(date);
  return (
    <div className={["flex min-h-control-88 w-full items-start justify-between gap-ah-16 rounded-ah-8 border border-border bg-surface p-ah-16", className].filter(Boolean).join(" ")} {...props}>
      <div className="min-w-0 space-y-ah-8">
        <div className="flex min-h-ah-24 items-start gap-ah-8 text-label text-ink">
          {calendarIcon && <span className="size-6 shrink-0" aria-hidden="true">{calendarIcon}</span>}
          <time className="break-words" dateTime={parseCalendarDate(date) ? date : undefined}>{label}</time>
        </div>
        <p className="break-words text-body text-muted">{meetingTime}</p>
      </div>
      <Button variant="secondary" className="shrink-0 px-ah-8 text-sidebar" disabled={disabled} onClick={onRemove} aria-label={`Remove ${label}`}>Remove</Button>
    </div>
  );
}
