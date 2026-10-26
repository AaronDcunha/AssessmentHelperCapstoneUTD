"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";
import { AssessmentRatingField } from "./assessment-rating-field";
import { facultyRoutes as routes } from "./faculty-routes";
import { ProposedDateSelector } from "./proposed-date-selector";
import { postFacultyAction } from "./faculty-api";
import type { FacultyWorkflow } from "@/server/queries/faculty-workflow";
import { FacultyCycleSelector, FacultyObservationSelector } from "./faculty-cycle-selector";
import { FacultyFeedbackControl, FacultyIssueControl } from "./faculty-participation-controls";

function dateTime(value: string, timeZone = "America/Chicago") {
  return new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

const panel = "rounded-ah-8 border border-border bg-surface p-ah-24 space-y-ah-12";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-ah-16"><h2 className="text-section">{title}</h2>{children}</section>;
}

function Back({ href = routes.dashboard }: { href?: string }) {
  return <ButtonLink href={href} variant="secondary" className="min-w-[180px] text-sidebar">Back</ButtonLink>;
}

export function EvaluationScreen({ data }: { data: FacultyWorkflow | null }) {
  const evaluation = data?.dashboard.evaluation, cycle = data?.dashboard.cycle;
  const labels = { due: "Due", overdue: "Overdue", notDue: "Not due", unknown: "Unknown", ineligible: "Ineligible" };
  return <div className="space-y-ah-24">
    <FacultyCycleSelector dashboard={data?.dashboard} />
    <Block title="Evaluation status"><div className={panel}>
      <p>Status: {evaluation && data?.dashboard.access.evaluation ? labels[evaluation.status] : "Unavailable"}</p><p>Hiring level: {evaluation?.hiringLevel ?? "Unavailable"}</p><p>Last evaluation: {evaluation?.lastCompletedEvaluation?.semester ?? (data?.dashboard.access.evaluation ? "None recorded" : "Unavailable")}</p>
      {evaluation?.status === "unknown" && <p className="text-muted">{evaluation.reason}</p>}
    </div></Block>
    <Block title="Current cycle"><div className={panel}>
      <p>{cycle?.semester ?? data?.dashboard.cycleReason ?? (data ? "No evaluation cycle is available." : "Evaluation data is temporarily unavailable.")}</p><p className="text-muted">Signup deadline: {cycle ? dateTime(cycle.signupDeadline, cycle.timeZone) : "Unavailable"}</p><p className="text-muted">Observation deadline: {cycle ? dateTime(cycle.observationDeadline, cycle.timeZone) : "Unavailable"}</p>
    </div></Block>
    <div className="flex flex-wrap gap-ah-16"><ButtonLink href={routes.signup} className="min-w-[240px]">Sign Up</ButtonLink><Back /></div>
  </div>;
}

export function SignupScreen({ data }: { data: FacultyWorkflow | null }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [sectionId, setSectionId] = useState(data?.existingSignup?.sectionId ?? "");
  const [dates, setDates] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const section = data?.sections.find(section => section.id === sectionId);
  return <form className="space-y-ah-32" onSubmit={async (event) => {
    event.preventDefault();
    if (pending || saved) return;
    if (!data?.signup.allowed) { setFeedback(data?.signup.reason ?? "Signup data is temporarily unavailable."); return; }
    if (!section || !dates.length) { setFeedback("Choose a course section and at least one scheduled date."); return; }
    setPending(true); setFeedback("");
    try {
      const response = await postFacultyAction<{ message: string }>("signup", { sectionId, dates });
      setSaved(true); setFeedback(response.message); router.refresh();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Signup was not submitted. Please try again."); }
    finally { setPending(false); }
  }}>
    <FacultyCycleSelector dashboard={data?.dashboard} />
    <Block title="1. Select Course and Section">
      <p className="text-muted">{data?.signup.reason || (data?.dashboard.cycle ? `Signup deadline: ${dateTime(data.dashboard.cycle.signupDeadline, data.dashboard.cycle.timeZone)}` : "Signup data is temporarily unavailable.")}</p>
      <Select label="Course / Section" value={sectionId} disabled={!data?.sections.length || pending || saved || !!data.existingSignup} onChange={event => { setSectionId(event.target.value); setDates([]); setFeedback(""); }} wrapperClassName="max-w-[620px]">
        <option value="">{data?.sections.length ? "Choose a course section" : "No assigned course sections available"}</option>
        {data?.sections.map(section => <option key={section.id} value={section.id}>{section.label}</option>)}
      </Select>
    </Block>
    <Block title="2. Proposed Observation Dates and Times">
      <p className="text-muted">Choose multiple class dates. Each option must be before the observation deadline.</p>
      {section && data?.signup.observationDeadline ? <>
        <ProposedDateSelector options={section.options} selected={dates} onChange={setDates} observationDeadline={data.signup.observationDeadline} disabled={pending || saved || !!data.existingSignup} />
        <p className="text-caption text-muted">Dates follow the stored weekly schedule in {data.dashboard.cycle?.timeZone} within configured semester dates. Holiday exceptions are not available; confirm that class meets before submitting. Days with multiple meetings cannot be selected.</p>
      </> : <div className={panel}><p>{data ? "Choose an assigned course section to see its scheduled dates." : "Class schedules are temporarily unavailable."}</p><p className="text-label">0 proposed options</p></div>}
    </Block>
    <Block title="3. Review"><div className={panel}><p>{section ? `${section.label} · ${dates.length} proposed dates` : "No course or dates selected."}</p><p className="text-caption text-muted">Your proposed dates and times will be shown to invited observers.</p></div></Block>
    {feedback && <p role="status" className={saved ? "text-sidebar" : "text-danger"}>{feedback}</p>}
    <div className="flex flex-wrap gap-ah-16"><Button type="submit" disabled={pending || saved || !data?.signup.allowed} aria-busy={pending} className="min-w-[200px]">{pending ? "Submitting…" : "Submit Signup"}</Button><ButtonLink variant="secondary" href={routes.dashboard}>Cancel</ButtonLink></div>
  </form>;
}

function CandidateTable({ accepted = false }: { accepted?: boolean }) {
  const columns = accepted
    ? ["Observer", "Status", "Observer-selected date / time", "Action"]
    : ["Observer", "Available proposed dates", "Selection"];
  return <div className="overflow-x-auto rounded-ah-8 border border-border">
    <table className="w-full">
      <caption className="sr-only">{accepted ? "Accepted observers" : "Recommended observers"}</caption>
      <thead><tr>{columns.map((label) => <TableCell key={label} variant="header">{label}</TableCell>)}</tr></thead>
      <tbody><tr><td colSpan={columns.length} className="bg-surface p-ah-24 text-muted">
        {accepted ? "No accepted candidates are available. Only observers who accepted an invitation can be chosen." : "No released observer recommendations are available. A submitted signup and released candidate list are needed."}
      </td></tr></tbody>
    </table>
  </div>;
}

function CommitteeAlertFeedback() {
  const [feedback, setFeedback] = useState("");
  return <div className="space-y-ah-16">
    <Button variant="secondary" onClick={() => setFeedback("The Assessment Committee was not notified. Alerts are not connected in this frontend. No observation or candidate list is available to include.")}>Alert Assessment Committee</Button>
    {feedback && <p role="status" className="rounded-ah-8 bg-warning-bg p-ah-16 text-warning">{feedback}</p>}
  </div>;
}

export function RecommendationsScreen() {
  return <div className="space-y-ah-24">
    <Block title="Select candidates to request">
      <p className="text-muted">These observers are available for at least one of your proposed dates. Select all or a subset.</p>
      <CandidateTable />
      <Button disabled aria-describedby="recommendations-unavailable">Send Requests</Button>
      <p id="recommendations-unavailable" className="text-caption text-muted">Requests require a released candidate list and at least one selection. A recommendation is not an acceptance or a final assignment.</p>
    </Block>
    <CommitteeAlertFeedback />
    <p className="text-muted">Need help with the list? Alert the Assessment Committee and explain the issue.</p>
    <Back href={routes.details} />
  </div>;
}

export function ConfirmedObserversScreen() {
  return <div className="space-y-ah-24">
    <Block title="Accepted candidates">
      <p className="text-muted">Each observer accepted one proposed date. Choose one observer to confirm the appointment.</p>
      <CandidateTable accepted />
      <p className="text-muted">Choosing an observer confirms their selected date and cancels the other pending or accepted invitations.</p>
    </Block>
    <CommitteeAlertFeedback />
    <Back href={routes.details} />
  </div>;
}

export function RequestsScreen({ data }: { data: FacultyWorkflow | null }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [declined, setDeclined] = useState<string[]>([]);
  const requests = data?.links?.requests.filter(request => !declined.includes(request.id)) ?? [];
  return <div className="space-y-ah-24"><Block title="Pending requests">
    <FacultyCycleSelector dashboard={data?.dashboard} />
    <p className="text-muted">Select one proposed date and time for each request before accepting. You may accept more than one request.</p>
    {!requests.length && <div className={panel}><p>{!data ? "Observer invitations are temporarily unavailable." : !data.dashboard.access.observations ? "Invitations are unavailable with your current permissions." : "No incoming observer invitations are available."}</p></div>}
    {requests.map(request => <div key={request.id} className={`${panel} grid gap-ah-24 lg:grid-cols-[1fr_2fr_1fr]`}>
      <div className="space-y-ah-8"><p>{request.observee}</p><p>{request.course}.{request.section}</p><p className="text-caption text-muted">Respond before {dateTime(request.expiresAt, data?.dashboard.cycle?.timeZone)}</p></div>
      <fieldset className="space-y-ah-12"><legend className="sr-only">Choose a proposed date for {request.observee}</legend>
        {!request.options.length && <p className="text-muted">No unambiguous proposed meetings are available.</p>}
        {request.options.map(option => <label key={option.id} className="flex items-center gap-ah-12 text-caption"><input type="radio" name={request.id} disabled={request.expired || request.status === "ACCEPTED"} checked={selection[request.id] === option.id} onChange={() => setSelection(previous => ({ ...previous, [request.id]: option.id }))} />{option.date} · {option.meetingTime}</label>)}
      </fieldset>
      <div className="space-y-ah-12"><Button fullWidth disabled={pending !== null || !selection[request.id] || request.expired || request.status === "ACCEPTED"} onClick={async () => {
        setPending(request.id); setFeedback("");
        try { const result = await postFacultyAction<{ message: string }>("requests/accept", { candidateId: request.id, meetingOptionId: selection[request.id], attemptId: request.attemptId }); setFeedback(result.message); router.refresh(); }
        catch (error) { setFeedback(error instanceof Error ? error.message : "Acceptance failed."); }
        finally { setPending(null); }
      }}>{request.status === "ACCEPTED" ? "Availability recorded" : "Accept selected date"}</Button>
        {request.expired && request.status !== "ACCEPTED" && <Button variant="secondary" disabled={pending !== null || !!request.approvalStatus} onClick={async () => {
          setPending(request.id);
          try { const result = await postFacultyAction<{ message: string }>("requests/late-acceptance", { candidateId: request.id, attemptId: request.attemptId }); setFeedback(result.message); router.refresh(); }
          catch (error) { setFeedback(error instanceof Error ? error.message : "Approval request failed."); }
          finally { setPending(null); }
        }}>{request.approvalStatus ? `Approval ${request.approvalStatus.toLowerCase()}` : "Request AC approval"}</Button>}
        <Button variant="secondary" fullWidth disabled={pending !== null || request.expired || request.status === "ACCEPTED"} onClick={async () => {
          setPending(request.id); setFeedback("");
          try { const response = await postFacultyAction<{ message: string }>("requests/decline", { candidateId: request.id, attemptId: request.attemptId }); setDeclined(previous => [...previous, request.id]); setFeedback(response.message); router.refresh(); }
          catch (error) { setFeedback(error instanceof Error ? error.message : "The invitation was not declined."); }
          finally { setPending(null); }
        }}>{pending === request.id ? "Declining…" : "Decline"}</Button></div>
    </div>)}
    {feedback && <p role="status" className="text-muted">{feedback}</p>}
    <p className="text-muted">Acceptance offers your selected date. The observee still chooses the final observer.</p>
  </Block><Back /></div>;
}

export function ObservationsScreen({ data }: { data: FacultyWorkflow | null }) {
  return <div className="space-y-ah-24">
    <FacultyCycleSelector dashboard={data?.dashboard} />
    <FacultyObservationSelector dashboard={data?.dashboard} />
    <Block title="Current observations"><div className={panel}>
      {data?.observation ? <><p>{data.observation.course}.{data.observation.section} · {data.observation.status}</p><p className="text-muted">As {data.observation.participation === "observee" ? "Observee" : "Observer"}</p><ButtonLink href={routes.details} variant="secondary">View Current Observation</ButtonLink>{data.observation.scheduledAt && <ButtonLink href={routes.appointment} variant="secondary">View Appointment</ButtonLink>}</> : <p>{data ? "No active observation records are available." : "Observation data is temporarily unavailable."}</p>}
    </div></Block>
    <FacultyFeedbackControl data={data} />
    <div className="flex flex-wrap gap-ah-16"><ButtonLink href={routes.signup}>Sign Up for Observation</ButtonLink><Back /></div>
  </div>;
}

function RecordFields({ fields, values = {} }: { fields: readonly (string | readonly string[])[]; values?: Record<string, string | null | undefined> }) {
  return <dl className="space-y-ah-12">{fields.map((row, index) => (
    <div key={index} className="flex flex-wrap gap-x-ah-16 gap-y-ah-4">
      {(typeof row === "string" ? [row] : row).map((field) => (
        <div key={field} className="inline-flex flex-wrap gap-x-ah-8"><dt>{field}:</dt><dd className="text-muted">{values[field] ?? "Unavailable"}</dd></div>
      ))}
    </div>
  ))}</dl>;
}

function IncompleteReportButton({ primary = false }: { primary?: boolean }) {
  return <Button variant={primary ? "primary" : "secondary"} disabled aria-describedby="observation-actions-unavailable">Report Not Completed</Button>;
}

export function ObservationDetailsScreen({ data }: { data: FacultyWorkflow | null }) {
  const record = data?.observation;
  return <div className="space-y-ah-24">
    <FacultyCycleSelector dashboard={data?.dashboard} /><FacultyObservationSelector dashboard={data?.dashboard} />
    <Block title="Observation"><div className={panel}>
      <RecordFields fields={["Course / Section", ["Observer", "Observee"], "Scheduled date and time"]} values={{ "Course / Section": record && `${record.course}.${record.section}`, Observer: record?.observer ?? "Not assigned", Observee: record?.observee, "Scheduled date and time": record?.scheduledAt ? dateTime(record.scheduledAt, data?.dashboard.cycle?.timeZone) : "Not scheduled" }} />
    </div></Block>
    <Block title="Progress"><div className={panel}><RecordFields fields={[["Status", "Your participation"]]} values={{ Status: record?.status, "Your participation": record?.participation }} />{!record && <p>{data ? "No current observation is available." : "Observation data is temporarily unavailable."}</p>}{record?.proposedDates.map(option => <p key={option.date}>{option.date} · {option.meetingTime}</p>)}</div></Block>
    <Block title="Actions"><div className="grid max-w-[992px] gap-ah-16 md:grid-cols-3">
      <ButtonLink variant="secondary" href={routes.form}>View Observation Form</ButtonLink>
      {record ? <FacultyIssueControl observationId={record.id} kind="NOT_OCCURRED" /> : <IncompleteReportButton />}
      <FacultyFeedbackControl data={data} />
    </div></Block>
    {record?.participation === "observee" && <><div className="flex flex-wrap gap-ah-16"><ButtonLink href={routes.recommendations} variant="secondary">View Recommendations</ButtonLink><ButtonLink href={routes.confirmed} variant="secondary">Choose Accepted Observer</ButtonLink></div><FacultyIssueControl observationId={record.id} kind="ALERT" /></>}
    <p id="observation-actions-unavailable" className="text-caption text-muted">Report non-occurrence after the appointment starts and before acknowledging. The observation form requires a scheduled observation and an assigned observer.</p>
    <Back href={routes.observations} />
  </div>;
}

export function AppointmentScreen({ data }: { data: FacultyWorkflow | null }) {
  const record = data?.observation;
  const scheduled = record?.scheduledAt ? new Date(record.scheduledAt) : null;
  const timeZone = data?.dashboard.cycle?.timeZone ?? "America/Chicago";
  const day = scheduled && new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(scheduled);
  const time = scheduled && new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(scheduled);
  const meetings = record?.meetings.filter(meeting => meeting.day === day && meeting.startTime === time) ?? [];
  return <div className="space-y-ah-24">
    <Block title="Confirmed appointment"><div className={panel}>
      <RecordFields fields={["Course / Section", ["Observee", "Observer"], ["Date", "Time", "Location"]]} values={{ "Course / Section": record && `${record.course}.${record.section}`, Observee: record?.observee, Observer: record?.observer,
        Date: scheduled ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone }).format(scheduled) : undefined,
        Time: scheduled ? new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone }).format(scheduled) : undefined,
        Location: meetings.length === 1 ? meetings[0].location : undefined }} />
    </div></Block>
    <Block title="Appointment status"><div className={panel}><RecordFields fields={[["Appointment status", "Observation done"]]} values={{ "Appointment status": record?.status, "Observation done": record ? "Not finalized" : undefined }} /></div></Block>
    <Block title="Actions"><div className="grid max-w-[992px] gap-ah-16 md:grid-cols-3">
      <ButtonLink variant="secondary" href={routes.details}>View Observation</ButtonLink>
      {record?.scheduledAt && record.observer ? <ButtonLink variant="secondary" href={routes.form}>Open Observation Form</ButtonLink> : <Button disabled aria-describedby="observation-actions-unavailable">Open Observation Form</Button>}
      {record ? <FacultyIssueControl observationId={record.id} kind="NOT_OCCURRED" /> : <IncompleteReportButton primary />}
    </div></Block>
    <p id="observation-actions-unavailable" className="text-caption text-muted">{record ? "The form opens after the scheduled observation starts. Report non-occurrence only if the meeting did not take place." : "Form submission requires a scheduled observation and an authorized participant. No appointment is available."}</p>
    <Back href={routes.observations} />
  </div>;
}

const scale = ["Poor", "Fair", "Satisfactory", "Good", "Excellent"].map((label, index) => ({ value: index + 1, label }));

/** Figma-only form preview. These labels are not a published assessment template. */
export function ObservationFormScreen() {
  const [step, setStep] = useState(1);
  const [ratings, setRatings] = useState<(number | null)[]>(Array(5).fill(null));
  const [responses, setResponses] = useState<string[]>(Array(5).fill(""));
  const [comments, setComments] = useState("");
  const [observerSignature, setObserverSignature] = useState("");
  const [feedback, setFeedback] = useState("");
  const [attemptedRatings, setAttemptedRatings] = useState(false);
  function move(next: number) { setStep(next); setFeedback(""); requestAnimationFrame(() => document.getElementById("form-step")?.focus()); }
  return <div className="space-y-ah-24">
    <p id="form-step" tabIndex={-1} className="text-muted">Step {step} of 3 · {["Scale questions", "Long response questions", "Comments and signatures"][step - 1]}</p>
    <p className="text-caption text-muted">Temporary form preview. Entries are discarded when you leave or reload; nothing is saved or submitted.</p>
    <form className="space-y-ah-24" onSubmit={(event) => {
      event.preventDefault();
      if (step === 1 && ratings.some((value) => value === null)) {
        setAttemptedRatings(true);
        setFeedback("Choose one rating for each preview question.");
        document.querySelectorAll<HTMLElement>('[role="radiogroup"]')[ratings.findIndex((value) => value === null)]?.querySelector<HTMLInputElement>('input')?.focus();
        return;
      }
      if (step < 3) move(step + 1);
      else if (!observerSignature.trim()) setFeedback("Enter an Observer Signature to finish the preview. This is not an authenticated signature.");
      else setFeedback("Preview complete. This form was not submitted or saved. A confirmed observation, versioned template, and separate participant acknowledgement support are required.");
    }}>
      <div className={panel} hidden={step !== 1}>
        <p className="border-b border-border pb-ah-24">Course / Section · Observer · Observee · Date: Unavailable</p>
        <h2 className="text-section">Scale questions</h2><p className="text-muted">Choose one rating per question. 1 = Poor; 5 = Excellent.</p>
        {ratings.map((value, index) => <AssessmentRatingField key={index} label={`Scale Question ${index + 1}`} options={scale} value={value} error={attemptedRatings && value === null ? "Choose a rating." : undefined} onChange={(rating) => setRatings((previous) => previous.map((current, position) => position === index ? rating : current))} />)}
      </div>
      <div className={panel} hidden={step !== 2}>{responses.map((value, index) => <Textarea key={index} label={`Long Response ${index + 1}`} placeholder="Enter your response" rows={3} wrapperClassName="max-w-[480px]" value={value} onChange={(event) => setResponses((previous) => previous.map((current, position) => position === index ? event.target.value : current))} />)}</div>
      <div className={panel} hidden={step !== 3}>
        <Textarea label="Additional Comments" placeholder="Enter additional comments" rows={3} wrapperClassName="max-w-[480px]" value={comments} onChange={(event) => setComments(event.target.value)} />
        <h2 className="border-t border-border pt-ah-24 text-section">Signatures</h2>
        <div className="grid gap-ah-24 md:grid-cols-2"><Input label="Observer Signature" placeholder="Sign here" value={observerSignature} onChange={(event) => setObserverSignature(event.target.value)} hint="Preview text only; this is not an authenticated signature." /><Input label="Observee Signature" placeholder="Sign here" disabled hint="The observee must acknowledge separately. A participant cannot sign for someone else." /></div>
        <p className="text-caption text-muted">The observee acknowledges that the observation occurred, not agreement with the ratings or comments. Both participants must sign before a real record can be finalized and locked.</p>
      </div>
      {feedback && <p role="alert" className="text-warning bg-warning-bg rounded-ah-8 p-ah-16">{feedback}</p>}
      <div className="flex flex-wrap gap-ah-16">{step > 1 && <Button variant="secondary" className="min-w-[200px]" onClick={() => move(step - 1)}>Back</Button>}<Button type="submit" className="min-w-[240px]">{step === 3 ? "Submit Form" : "Next"}</Button><ButtonLink variant="secondary" href={routes.details}>Cancel</ButtonLink></div>
    </form>
  </div>;
}
