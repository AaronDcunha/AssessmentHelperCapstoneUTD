import type { ObservationCandidate, ObservationMeeting, ObserverSelectionSignup } from "@/lib/ac-api";

export function signupCourseLabel(signup: ObserverSelectionSignup) {
  const code = signup.section.course.code?.trim() || "Course unavailable";
  const section = signup.section.sectionNumber?.trim();
  return section ? `${code} · Section ${section}` : code;
}

function dateLabel(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Date unavailable";
  try { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(date); }
  catch { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date); }
}

function timeLabel(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "Time unavailable";
  try { return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(date); }
  catch { return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(date); }
}

export function meetingLabel(meeting: ObservationMeeting) {
  return `${dateLabel(meeting.startsAt || meeting.date, meeting.timeZone)} · ${timeLabel(meeting.startsAt, meeting.timeZone)}–${timeLabel(meeting.endsAt, meeting.timeZone)}`;
}

export function proposedMeetingsLabel(meetings: readonly ObservationMeeting[]) {
  return meetings.length ? meetings.map(meetingLabel).join("; ") : "No proposed meetings";
}

export function candidateMeetings(candidate: ObservationCandidate, meetings: readonly ObservationMeeting[]) {
  const ids = new Set(candidate.availableMeetingOptionIds);
  return meetings.filter((meeting) => ids.has(meeting.id));
}

export function courseHistoryLabel(candidate: ObservationCandidate) {
  const history = candidate.courseHistory;
  if (typeof history === "string") return history.trim() || "—";
  if (!history) return "—";
  return history.label?.trim() || [history.courseCode, history.semester].filter(Boolean).join(" · ") || "—";
}

export function matchState(generated: boolean, count: number) {
  if (!generated) return { label: "Not generated", tone: "neutral" as const };
  if (count === 0) return { label: "No matches", tone: "danger" as const };
  if (count < 5) return { label: `${count} ${count === 1 ? "match" : "matches"}`, tone: "warning" as const };
  return { label: `${count} matches`, tone: "neutral" as const };
}
