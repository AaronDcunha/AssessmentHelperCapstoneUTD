"use client";

import { useId } from "react";
import { DayPicker, TZDate, type NextMonthButtonProps, type PreviousMonthButtonProps } from "@daypicker/react";
import { Button } from "@/components/ui/button";
import { calendarDateKey, parseCalendarDate } from "@/lib/calendar-date";
import "@daypicker/react/style.css";
import styles from "./date-picker.module.css";

export type DatePickerProps = {
  availableDates: readonly string[];
  selected: readonly string[];
  onSelect: (dates: string[]) => void;
  /** Exclusive YYYY-MM-DD cutoff, matching Figma's "before the deadline" rule. */
  observationDeadline: string;
  defaultMonth?: string;
  disabled?: boolean;
  error?: string;
  label?: string;
  className?: string;
};

function PreviousMonthButton(props: PreviousMonthButtonProps) {
  return <Button {...props} variant="secondary"><span aria-hidden="true">‹</span></Button>;
}

function NextMonthButton(props: NextMonthButtonProps) {
  return <Button {...props} variant="secondary"><span aria-hidden="true">›</span></Button>;
}

/** Controlled multiple-date calendar. The caller supplies eligible section dates. */
export function DatePicker({
  availableDates, selected, onSelect, observationDeadline, defaultMonth,
  disabled = false, error, label = "Proposed observation dates", className,
}: DatePickerProps) {
  const messageId = useId();
  const available = new Set(availableDates.filter((date) => parseCalendarDate(date)));
  const deadline = parseCalendarDate(observationDeadline);
  const isAvailable = (date: string) => Boolean(deadline && available.has(date) && date < observationDeadline);
  const message = error
    || (!deadline ? "The observation deadline must be a valid YYYY-MM-DD date." : undefined)
    || (available.size !== availableDates.length ? "Available dates must be valid, unique YYYY-MM-DD dates." : undefined)
    || (selected.some((date) => !parseCalendarDate(date) || !isAvailable(date)) ? "Some selected dates are invalid, unavailable, or on/after the deadline. Remove them and choose available dates." : undefined)
    || (defaultMonth && !parseCalendarDate(defaultMonth) ? "The initial month must be a valid YYYY-MM-DD date." : undefined);
  const dates = [...new Set(selected)].flatMap((value) => {
    const date = parseCalendarDate(value);
    return date ? [new TZDate(date, "UTC")] : [];
  });
  const initialMonth = [defaultMonth, ...selected, ...availableDates].flatMap((value) => {
    const date = value ? parseCalendarDate(value) : undefined;
    return date ? [new TZDate(date, "UTC")] : [];
  })[0];

  return (
    <div
      role="group" aria-label={label} aria-describedby={message ? messageId : undefined}
      className={["w-[336px] max-w-full shrink-0 rounded-ah-8 border border-border bg-surface p-ah-16", className].filter(Boolean).join(" ")}
    >
      <DayPicker
        className={styles.calendar}
        mode="multiple" timeZone="UTC" navLayout="around" aria-label={label}
        defaultMonth={initialMonth} selected={dates}
        disabled={(date) => disabled || !isAvailable(calendarDateKey(date))}
        onSelect={(_, date) => {
          const key = calendarDateKey(date);
          if (disabled || !isAvailable(key)) return;
          onSelect(selected.includes(key) ? selected.filter((value) => value !== key) : [...new Set([...selected, key])].sort());
        }}
        components={{ PreviousMonthButton, NextMonthButton }}
        formatters={{ formatWeekdayName: (date) => new Intl.DateTimeFormat("en-US", { weekday: "narrow", timeZone: "UTC" }).format(date) }}
      />
      <p className="mt-ah-8 text-caption text-muted">Click a date to add or remove it.<br />Available dates follow the section schedule.</p>
      {message && <p id={messageId} role="alert" className="mt-ah-8 text-caption text-danger">{message}</p>}
    </div>
  );
}
