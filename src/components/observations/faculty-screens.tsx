"use client";

import { useState, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";
import { AssessmentRatingField } from "./assessment-rating-field";
import { facultyRoutes as routes } from "./faculty-routes";

const panel = "rounded-ah-8 border border-border bg-surface p-ah-24 space-y-ah-12";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-ah-16"><h2 className="text-section">{title}</h2>{children}</section>;
}

function Back({ href = routes.dashboard }: { href?: string }) {
  return <ButtonLink href={href} variant="secondary" className="min-w-[180px] text-sidebar">Back</ButtonLink>;
}

export function EvaluationScreen() {
  return <div className="space-y-ah-24">
    <Block title="Evaluation status"><div className={panel}>
      <p>Status: Unavailable</p><p>Hiring level: Unavailable</p><p>Last evaluation: Unavailable</p>
    </div></Block>
    <Block title="Current cycle"><div className={panel}>
      <p>No evaluation cycle is available.</p><p className="text-muted">Signup deadline: Unavailable</p><p className="text-muted">Observation deadline: Unavailable</p>
    </div></Block>
    <div className="flex flex-wrap gap-ah-16"><ButtonLink href={routes.signup} className="min-w-[240px]">Sign Up</ButtonLink><Back /></div>
  </div>;
}

export function SignupScreen() {
  const [feedback, setFeedback] = useState("");
  return <form className="space-y-ah-32" onSubmit={(event) => { event.preventDefault(); setFeedback("Signup was not submitted. An active cycle, an assigned course section, and available class dates are required. Faculty signup is not connected yet."); }}>
    <Block title="1. Select Course and Section">
      <p className="text-muted">No active cycle is available. Eligibility and the signup deadline cannot be verified.</p>
      <Select label="Course / Section" value="" disabled wrapperClassName="max-w-[620px]" hint="No eligible course sections are available for signup."><option value="">No assigned course sections available</option></Select>
    </Block>
    <Block title="2. Proposed Observation Dates and Times">
      <p className="text-muted">Choose multiple class dates. Each option must be before the observation deadline.</p>
      <div className={panel}><p>No scheduled class dates are available.</p><p className="text-muted">A course section, its meeting schedule, and the cycle observation deadline are needed before dates can be selected.</p><p className="text-label">0 proposed options</p></div>
    </Block>
    <Block title="3. Review"><div className={panel}><p>No course or dates selected.</p><p className="text-caption text-muted">Your proposed dates and times will be shown to invited observers.</p></div></Block>
    {feedback && <p role="alert" className="text-danger">{feedback}</p>}
    <div className="flex flex-wrap gap-ah-16"><Button type="submit" className="min-w-[200px]">Submit Signup</Button><ButtonLink variant="secondary" href={routes.dashboard}>Cancel</ButtonLink></div>
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

export function RequestsScreen() {
  return <div className="space-y-ah-24"><Block title="Pending requests">
    <p className="text-muted">Select one proposed date and time for each request before accepting. You may accept more than one request.</p>
    <div className={panel}><p>No incoming observer invitations are available.</p><p className="text-muted">Your received invitations will show the observee, course / section, proposed dates, response status, and response window.</p></div>
    <p className="text-muted">Acceptance offers your selected date. The observee still chooses the final observer.</p>
  </Block><Back /></div>;
}

export function ObservationsScreen() {
  return <div className="space-y-ah-24">
    <Block title="Current observations"><div className={panel}>
      <p>No active observation records are available.</p>
      <p className="text-muted">Current work as an Observer or Observee will appear here, with the next action for each observation.</p>
    </div></Block>
    <div className="flex flex-wrap gap-ah-16"><ButtonLink href={routes.signup}>Sign Up for Observation</ButtonLink><Back /></div>
  </div>;
}

function RecordFields({ fields }: { fields: readonly (string | readonly string[])[] }) {
  return <dl className="space-y-ah-12">{fields.map((row, index) => (
    <div key={index} className="flex flex-wrap gap-x-ah-16 gap-y-ah-4">
      {(typeof row === "string" ? [row] : row).map((field) => (
        <div key={field} className="inline-flex flex-wrap gap-x-ah-8"><dt>{field}:</dt><dd className="text-muted">Unavailable</dd></div>
      ))}
    </div>
  ))}</dl>;
}

function IncompleteReportButton({ primary = false }: { primary?: boolean }) {
  return <Button variant={primary ? "primary" : "secondary"} disabled aria-describedby="observation-actions-unavailable">Report Not Completed</Button>;
}

export function ObservationDetailsScreen() {
  return <div className="space-y-ah-24">
    <Block title="Observation"><div className={panel}>
      <RecordFields fields={["Course / Section", ["Observer", "Observee"], "Scheduled date and time"]} />
    </div></Block>
    <Block title="Progress"><div className={panel}><RecordFields fields={[["Status", "Your participation"]]} /><p>No observation progress or outstanding actions are available.</p></div></Block>
    <Block title="Actions"><div className="grid max-w-[992px] gap-ah-16 md:grid-cols-3">
      <ButtonLink variant="secondary" href={routes.form}>View Observation Form</ButtonLink>
      <IncompleteReportButton />
      <Button disabled aria-describedby="survey-unavailable">Complete Survey</Button>
    </div></Block>
    <p id="observation-actions-unavailable" className="text-caption text-muted">Record actions require an authorized observation and participant role. No record is available; the form opens a temporary preview.</p>
    <p id="survey-unavailable" className="text-caption text-muted">Process feedback is available only to participating faculty during the cycle feedback period. Participation and feedback dates are unavailable.</p>
    <Back href={routes.observations} />
  </div>;
}

export function AppointmentScreen() {
  return <div className="space-y-ah-24">
    <Block title="Confirmed appointment"><div className={panel}>
      <RecordFields fields={["Course / Section", ["Observee", "Observer"], ["Date", "Time", "Location"]]} />
    </div></Block>
    <Block title="Appointment status"><div className={panel}><RecordFields fields={[["Appointment status", "Observation done"]]} /></div></Block>
    <Block title="Actions"><div className="grid max-w-[992px] gap-ah-16 md:grid-cols-3">
      <ButtonLink variant="secondary" href={routes.details}>View Observation</ButtonLink>
      <Button disabled aria-describedby="observation-actions-unavailable">Open Observation Form</Button>
      <IncompleteReportButton primary />
    </div></Block>
    <p id="observation-actions-unavailable" className="text-caption text-muted">Form submission and incomplete reports require a confirmed observation and an authorized participant. No appointment is available.</p>
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
