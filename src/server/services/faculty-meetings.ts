import { meetingForDate, type WeeklyMeeting } from "./faculty-calendar";

// Interpret local schedule time in its configured zone, rejecting DST gaps/folds.
export function localMeetingInstant(date: string, time: string, timeZone: string): Date | null {
  const desired = `${date}T${time}:00`;
  const formatter = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const local = (value: number) => formatter.format(new Date(value)).replace(" ", "T");
  const target = Date.parse(`${desired}Z`);
  let guess = target;
  for (let i = 0; i < 4; i++) guess += target - Date.parse(`${local(guess)}Z`);
  if (local(guess) !== desired || [guess - 3600000, guess + 3600000].some(value => local(value) === desired)) return null;
  return new Date(guess);
}

export function meetingOccurrence(date: string, meetings: readonly WeeklyMeeting[], timeZone: string) {
  if (!meetingForDate(date, meetings)) return null;
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  const meeting = meetings.find(meeting => meeting.day === weekday)!;
  const startsAt = localMeetingInstant(date, meeting.startTime, timeZone), endsAt = localMeetingInstant(date, meeting.endTime, timeZone);
  return startsAt && endsAt && endsAt > startsAt ? { startsAt, endsAt, timeZone, location: meeting.location } : null;
}
