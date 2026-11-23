import Image from "next/image";
import { Section } from "@/components/ui/section";
import type { ObservationDetail, ObservationMeeting } from "@/lib/ac-api";

export function observationStatusLabel(status: string | null | undefined) {
  return status?.trim().replace(/_+/g, " ").toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase()) || undefined;
}

function meetingZone(value: string | null | undefined) {
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

const milestoneBadge = {
  completed: "bg-light text-sidebar",
  next: "bg-sidebar text-surface",
  pending: "bg-neutral-bg text-ink",
};

function ObservationProgress({ detail }: { detail: ObservationDetail }) {
  const steps = detail.progress ?? [];
  const completedCount = steps.filter(step => step.state.toLowerCase() === "completed").length;
  const closed = ["COMPLETED", "CANCELLED", "CANCELED", "NOT_OCCURRED"].includes(detail.observation.status?.toUpperCase() ?? "");
  const nextIndex = closed ? -1 : steps.findIndex(step => step.state.toLowerCase() === "pending");

  return <Section title="Observation progress"
    actions={steps.length > 0 && <p className="text-label text-muted">{completedCount} of {steps.length} milestones complete</p>}
    className="[&>div:first-child]:mb-ah-12 [&>div:first-child]:items-center">
    {steps.length > 0 ? (
      <ol role="list" aria-label="Observation progress timeline" className="border-t border-border pt-ah-12">
        {steps.map((step, index) => {
          const complete = step.state.toLowerCase() === "completed";
          const next = index === nextIndex;
          const tone = complete ? "completed" : next ? "next" : "pending";
          const label = next ? "Next step" : observationStatusLabel(step.state) ?? "State not provided";
          const date = complete && step.completedAt ? timestamp(step.completedAt) : "—";
          const guidance = step.key === "survey" ? "The observee and observer each submit a survey."
            : next && step.key === "observer" ? "Choose an observer to move on to scheduling." : null;
          return <li key={`${step.key}-${index}`} aria-current={next ? "step" : undefined}
            className="group relative grid min-h-[60px] grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-ah-8 py-ah-8 sm:gap-ah-16">
            <span aria-hidden="true" className="absolute inset-y-0 left-[11px] w-0.5 bg-border group-first:top-1/2 group-last:bottom-1/2" />
            <span aria-hidden="true" className="relative grid size-ah-24 place-items-center">
              {complete ? <span className="grid size-ah-24 place-items-center rounded-ah-pill bg-sidebar">
                <Image src="/observation-progress/completed-check.svg" alt="" width={12} height={12} unoptimized />
              </span> : next ? <Image src="/observation-progress/next-marker.svg" alt="" width={24} height={24} unoptimized />
                : <span className="size-ah-24 rounded-ah-pill border-2 border-muted bg-surface" />}
            </span>
            <div className="min-w-0 space-y-ah-4">
              <h3 className="text-body text-ink">{step.label?.trim() || step.key}</h3>
              {date !== "—" ? <time dateTime={step.completedAt ?? undefined} className="block text-caption text-muted">{date}</time>
                : guidance && !complete ? <p className="text-caption text-muted">{guidance}</p> : null}
            </div>
            <span className={`rounded-ah-pill px-ah-8 py-ah-4 text-center text-label sm:px-ah-12 ${milestoneBadge[tone]}`}>{label}</span>
          </li>;
        })}
      </ol>
    ) : <p className="text-body text-muted">No progress information is available.</p>}
  </Section>;
}

export function ObservationTrackingDetails({ detail }: { detail: ObservationDetail }) {
  const scheduled = detail.observation.scheduledMeeting;
  return <>
    <ObservationProgress detail={detail} />
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
