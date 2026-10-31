import type { Cycle, ObservationCandidate, ObservationCandidatesResponse, ObservationMeeting, ObserverSelectionSignup } from "@/lib/ac-api";

export function currentSemesterCycle(cycles: readonly Cycle[], now: number | null) {
  if (now === null) return null;
  const current = cycles.filter(cycle => {
    const semester = cycle.semester;
    if (!semester?.startsOn || !semester.endsOn || !semester.timeZone) return false;
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: semester.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
      const part = (type: string) => parts.find(value => value.type === type)?.value;
      const today = `${part("year")}-${part("month")}-${part("day")}`;
      return semester.startsOn <= today && today <= semester.endsOn;
    } catch { return false; }
  });
  return current.length === 1 ? current[0] : null;
}

export function hasGeneratedList(candidates: ObservationCandidatesResponse | null) {
  if (candidates && "list" in candidates) return !!candidates.list;
  return !!candidates && (!!candidates.generationId || !!candidates.releasedAt || candidates.items.length > 0);
}

export function initialSignupAvailable(signup: ObserverSelectionSignup, candidates: ObservationCandidatesResponse | null, candidateError: string | null) {
  return !!signup.observationId && !candidateError && !signup.currentReleasedListId && !candidates?.currentReleasedListId && !candidates?.releasedAt;
}

export function recommendationGeneration(candidates: ObservationCandidatesResponse | null) {
  if (candidates && "list" in candidates) return candidates.list?.generationId ?? null;
  return candidates?.generationId ?? null;
}

export function signupWindow(deadline: string | null | undefined, now: number | null) {
  const timestamp = deadline ? Date.parse(deadline) : NaN;
  if (!Number.isFinite(timestamp) || now === null) return "unknown";
  return now <= timestamp ? "open" : "closed";
}

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
  if (!meeting.startsAt || !meeting.endsAt || !meeting.timeZone) return `${meeting.date} · Time unavailable`;
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
  if (!history?.length) return "—";
  return history.map(entry => `${entry.course.code} · ${entry.semester.name}`).join("; ");
}

export function matchState(generated: boolean, count: number) {
  if (!generated) return { label: "Not generated", tone: "neutral" as const };
  if (count === 0) return { label: "No matches", tone: "danger" as const };
  if (count < 5) return { label: `${count} ${count === 1 ? "match" : "matches"}`, tone: "warning" as const };
  return { label: `${count} matches`, tone: "neutral" as const };
}
