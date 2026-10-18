"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertAssessmentCommitteeDialog,
  type AssessmentCommitteeAlertReason,
  type AssessmentCommitteeAlertStatus,
  type AssessmentCommitteeAlertValues,
} from "@/components/observations/alert-assessment-committee-dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";

// Demonstration values only. Figma/reference documents do not define backend reason codes.
const sampleReasons: AssessmentCommitteeAlertReason[] = [
  { value: "sample-candidate-help", label: "Sample reason: help with candidate list" },
  { value: "sample-date-help", label: "Sample reason: help with accepted dates" },
];
const emptyValues: AssessmentCommitteeAlertValues = { reason: "", details: "" };

export default function AlertAcPreviewPage() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(emptyValues);
  const [status, setStatus] = useState<AssessmentCommitteeAlertStatus>("idle");
  const [outcome, setOutcome] = useState("success");
  const [error, setError] = useState<string>();
  const [submitted, setSubmitted] = useState<AssessmentCommitteeAlertValues>();
  const [cancelled, setCancelled] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopSimulation() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }

  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);

  function start() {
    stopSimulation();
    setStatus("idle");
    setError(undefined);
    setValue(emptyValues);
    setOpen(true);
  }

  function submit(values: AssessmentCommitteeAlertValues) {
    if (timer.current !== null) return;
    setStatus("pending");
    setError(undefined);
    setAttempts((count) => count + 1);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (outcome === "failure") {
        setStatus("error");
        setError("Simulated submission failure. Nothing was sent. Your entries are preserved; try again or cancel.");
      } else {
        setSubmitted(values);
        setStatus("success");
      }
    }, 1200);
  }

  return (
    <div className="space-y-ah-24">
      <Section title="Alert Assessment Committee" description="Interactive preview only. All reason options are samples, and submissions use a local timer. No API calls or notifications are made.">
        <div className="mb-ah-24 max-w-[336px]">
          <Select label="Simulated submission outcome" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </Select>
        </div>
        <Button onClick={start}>Alert Assessment Committee</Button>
        <p className="mt-ah-16 text-caption text-muted">Send an empty form to see validation. This preview requires details to demonstrate caller-configured validation. Cancel or press Escape to close; focus returns to the opening button. Cancel also stops a pending simulation.</p>
      </Section>
      <Section title="Preview results" description="Change the simulated outcome above and reopen the dialog to try both submission states.">
        <p role="status" aria-atomic="true" className="text-body text-ink">Submission attempts: {attempts}. Cancellations: {cancelled}.</p>
        {submitted ? (
          <dl className="mt-ah-16 space-y-ah-8 break-words text-body text-ink">
            <dt className="text-label">Last simulated successful reason</dt><dd>{sampleReasons.find((reason) => reason.value === submitted.reason)?.label}</dd>
            <dt className="text-label">Last simulated successful details</dt><dd className="whitespace-pre-wrap">{submitted.details}</dd>
          </dl>
        ) : <p className="mt-ah-16 text-body text-muted">No successful simulated submission yet.</p>}
      </Section>
      <AlertAssessmentCommitteeDialog
        open={open} onOpenChange={setOpen} value={value} reasonOptions={sampleReasons}
        onChange={(next) => { setValue(next); setStatus("idle"); setError(undefined); }}
        onSubmit={submit} status={status} error={error} detailsRequired
        onCancel={() => { stopSimulation(); setStatus("idle"); setError(undefined); setCancelled((count) => count + 1); }}
        contextDescription="Preview only: no observation or candidate list is attached. The integrated screen supplies that context."
        successMessage="Simulated success. An integrated submission would create an alert pending for this observation. Nothing was sent from this preview."
      />
    </div>
  );
}
