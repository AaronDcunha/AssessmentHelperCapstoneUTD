/** Date-only UI values; UTC is used only to avoid browser time-zone date shifts. */
export function parseCalendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : undefined;
}

export function calendarDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function calendarDateLabel(value: string): string {
  const date = parseCalendarDate(value);
  return date
    ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date)
    : value;
}
