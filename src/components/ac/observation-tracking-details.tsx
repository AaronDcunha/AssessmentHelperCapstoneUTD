import { Section } from "@/components/ui/section";
import type { ObservationDetail, ObservationMeeting } from "@/lib/ac-api";

function meetingZone(value: string | undefined) {
  if (value) {
    try { new Intl.DateTimeFormat(undefined, { timeZone: value }); return value; } catch { /* Display in UTC when zone metadata is absent or invalid. */ }
  }
  return null;
}
function timestamp(value: string | null | undefined, zone = "UTC") {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: zone }).format(date)} (${zone})`;
}
function MeetingDetails({ meeting }: { meeting: ObservationMeeting }) {
  const zone = meetingZone(meeting.timeZone);
  return <div className="space-y-ah-12">
    <dl className="grid gap-ah-16 sm:grid-cols-2">
      <div><dt className="text-label text-muted">Meeting date</dt><dd className="text-body text-ink">{meeting.date || "—"}</dd></div>
      <div><dt className="text-label text-muted">Location</dt><dd className="break-words text-body text-ink">{meeting.location?.trim() || "Not provided"}</dd></div>
      <div><dt className="text-label text-muted">Starts</dt><dd className="text-body text-ink">{timestamp(meeting.startsAt, zone ?? "UTC")}</dd></div>
      <div><dt className="text-label text-muted">Ends</dt><dd className="text-body text-ink">{timestamp(meeting.endsAt, zone ?? "UTC")}</dd></div>
    </dl>
    {!zone && <p className="text-caption text-muted">The meeting time zone is unavailable. Times are shown in UTC.</p>}
    {typeof meeting.available === "boolean" && <p className="text-body text-muted">{meeting.available ? "Available" : "Unavailable"}</p>}
    {meeting.reason?.trim() && <p className="whitespace-pre-wrap break-words text-body text-muted">{meeting.reason}</p>}
  </div>;
}

export function ObservationTrackingDetails({ detail }: { detail: ObservationDetail }) {
  const scheduled = detail.observation.scheduledMeeting;
  return <>
    <Section title="Observation progress">
      {detail.progress?.length ? <ol className="space-y-ah-16" aria-label="Observation progress timeline">
        {detail.progress.map((step, index) => <li key={`${step.key}-${index}`} className="border-l-2 border-border pl-ah-16">
          <h3 className="text-label text-ink">{step.label?.trim() || step.key}</h3>
          <p className="text-body text-ink">{step.state || "State not provided"}</p>
          <p className="text-caption text-muted">{step.completedAt ? `Completed: ${timestamp(step.completedAt)}` : "Completion date not recorded"}</p>
        </li>)}
      </ol> : <p className="text-body text-muted">No progress information is available.</p>}
    </Section>
    <Section title="Scheduled observation">
      {scheduled ? <MeetingDetails meeting={scheduled} /> : <p className="text-body text-muted">
        {scheduled === null ? "No observation meeting is scheduled." : "Scheduled meeting information is unavailable."}
      </p>}
    </Section>
    <Section title="Proposed meeting options" description="These are proposed options, not a confirmed observation appointment.">
      {detail.proposedMeetings?.length ? <ol className="space-y-ah-24" aria-label="Proposed meeting options">
        {detail.proposedMeetings.map((meeting, index) => <li key={meeting.id} className="space-y-ah-12 border-t border-border pt-ah-16">
          <h3 className="text-label text-ink">Option {index + 1}</h3>
          <MeetingDetails meeting={meeting} />
        </li>)}
      </ol> : <p className="text-body text-muted">No proposed meeting information is available.</p>}
    </Section>
  </>;
}
