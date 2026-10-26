import { parseCalendarDate } from "../../lib/calendar-date";

export const facultyTimeZone = "America/Chicago";
export type WeeklyMeeting = { id: string; day: string; startTime: string; endTime: string; location: string | null };
export type MeetingOption = { date: string; meetingTime: string };
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function facultyDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: facultyTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}

function validMeeting(meeting: WeeklyMeeting) {
  return weekdays.includes(meeting.day) && /^([01]\d|2[0-3]):[0-5]\d$/.test(meeting.startTime)
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(meeting.endTime) && meeting.startTime < meeting.endTime;
}

/** Date-only choices use the stored local schedule, never browser-local dates/times. */
export function meetingForDate(date: string, meetings: readonly WeeklyMeeting[]): MeetingOption | null {
  const parsed = parseCalendarDate(date);
  if (!parsed) return null;
  const matches = meetings.filter(meeting => meeting.day === weekdays[parsed.getUTCDay()]);
  // The existing date-only schema/UI cannot distinguish two meetings on the same day.
  if (matches.length !== 1 || !validMeeting(matches[0])) return null;
  return { date, meetingTime: `${matches[0].startTime}–${matches[0].endTime} · Scheduled class meeting` };
}

export function proposedMeetingOptions(meetings: readonly WeeklyMeeting[], now: Date, deadline: Date): MeetingOption[] {
  const first = facultyDate(now), last = facultyDate(deadline);
  const start = parseCalendarDate(first), end = parseCalendarDate(last);
  // Invalid/far-future cycles must not cause unbounded recurrence expansion.
  if (!start || !end || end <= start || end.getTime() - start.getTime() > 366 * 86400000) return [];
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: facultyTimeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const options: MeetingOption[] = [];
  for (const date = new Date(start); date < end; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    const option = meetingForDate(key, meetings);
    // Today's class must not already have started. Deadline date is exclusive, matching DatePicker.
    if (option && (key !== first || option.meetingTime.slice(0, 5) > time)) options.push(option);
  }
  return options;
}
