"use client";

import { useRef, type ReactNode } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { ProposedDateOption } from "./proposed-date-option";
import { parseCalendarDate } from "@/lib/calendar-date";

export type ProposedMeetingOption = {
  /** One pre-resolved section meeting per YYYY-MM-DD date. */
  date: string;
  meetingTime: string;
  disabled?: boolean;
};

export type ProposedDateSelectorProps = {
  options: readonly ProposedMeetingOption[];
  selected: readonly string[];
  onChange: (dates: string[]) => void;
  observationDeadline: string;
  defaultMonth?: string;
  disabled?: boolean;
  error?: string;
  calendarIcon?: ReactNode;
};

/** Calendar and cards derive from the same parent-owned selection. */
export function ProposedDateSelector({ options, selected, onChange, observationDeadline, defaultMonth, disabled, error, calendarIcon }: ProposedDateSelectorProps) {
  const calendar = useRef<HTMLDivElement>(null);
  const counts = new Map<string, number>();
  for (const option of options) counts.set(option.date, (counts.get(option.date) ?? 0) + 1);
  const invalidOptions = counts.size !== options.length || options.some((option) => !parseCalendarDate(option.date) || !option.meetingTime.trim());
  const availableDates = options.filter((option) => !option.disabled && option.meetingTime.trim() && counts.get(option.date) === 1).map((option) => option.date);
  const selectedDates = [...new Set(selected)];

  function remove(date: string) {
    onChange(selected.filter((value) => value !== date));
    requestAnimationFrame(() => {
      // Restore focus after the Remove button leaves the document.
      const day = parseCalendarDate(date) ? calendar.current?.querySelector<HTMLButtonElement>(`[data-day="${date}"] button:not(:disabled)`) : undefined;
      (day ?? calendar.current?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
    });
  }

  return (
    <div className="flex flex-col items-start gap-ah-24 xl:flex-row">
      <div ref={calendar} className="w-full max-w-[336px] shrink-0">
        <DatePicker availableDates={availableDates} selected={selected} onSelect={onChange} observationDeadline={observationDeadline} defaultMonth={defaultMonth} disabled={disabled}
          error={error || (invalidOptions ? "Meeting options need valid, unique dates and a meeting time for each date." : undefined)} />
      </div>
      <div className="w-full min-w-0 flex-1 space-y-ah-12">
        <p role="status" aria-atomic="true" className="text-label text-ink">{selectedDates.length} proposed {selectedDates.length === 1 ? "option" : "options"}</p>
        {selectedDates.length === 0 && <p className="text-body text-muted">{availableDates.some((date) => parseCalendarDate(date) && parseCalendarDate(observationDeadline) && date < observationDeadline) ? "No dates selected. Choose an available calendar date." : "No available dates before the observation deadline."}</p>}
        {selectedDates.map((date) => (
          <ProposedDateOption key={date} date={date} meetingTime={options.find((option) => option.date === date)?.meetingTime || "Meeting information unavailable"}
            onRemove={() => remove(date)} disabled={disabled} calendarIcon={calendarIcon} />
        ))}
      </div>
    </div>
  );
}
