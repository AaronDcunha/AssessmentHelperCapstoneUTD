"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form-fields";
import { AssessmentRatingField } from "./assessment-rating-field";
import { postFacultyAction } from "./faculty-api";
import { facultyRoutes } from "./faculty-routes";
import type { FacultyAssessment, AssessmentAnswers } from "@/server/queries/faculty-assessment";

const panel = "rounded-ah-8 border border-border bg-surface p-ah-24 space-y-ah-24";

export function FacultyAssessmentScreen({ initial, unavailable = false }: { initial: FacultyAssessment | null; unavailable?: boolean }) {
  const [form, setForm] = useState(initial);
  const [responses, setResponses] = useState<AssessmentAnswers>(initial?.responses ?? { answers: {}, comments: "" });
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  if (!form) return <div className="space-y-ah-24"><div className={panel}><p>{unavailable ? "The observation form is temporarily unavailable." : "No observation form is available. Confirm an observer and appointment, and make sure a published observation template is available."}</p></div><ButtonLink href={facultyRoutes.details} variant="secondary">Back</ButtonLink></div>;
  const current = form;
  const ratings = current.criteria.filter(criterion => criterion.type === "RATING");
  const text = current.criteria.filter(criterion => criterion.type === "TEXT");
  function answer(id: string, value: string | number) { setResponses(previous => ({ ...previous, answers: { ...previous.answers, [id]: value } })); }
  function move(next: number) { setStep(next); requestAnimationFrame(() => document.getElementById("form-step")?.focus()); }
  return <div className="space-y-ah-24">
    <p id="form-step" tabIndex={-1} className="text-muted">Step {step} of 3 · {["Scale questions", "Long response questions", "Comments and signatures"][step - 1]}</p>
    <form noValidate className="space-y-ah-24" onSubmit={async event => {
      event.preventDefault(); if (pending) return;
      if (step < 3 && current.locked) { move(step + 1); return; }
      if (current.locked) return;
      if (step < 3 && !current.canEdit) { move(step + 1); return; }
      const questions = step === 1 ? ratings : step === 2 ? text : [];
      if (current.canEdit && questions.some(question => question.required && (responses.answers[question.id] === undefined || String(responses.answers[question.id]).trim() === ""))) { setFeedback("Complete the required questions before continuing."); return; }
      if (step === 3 && (!current.canAcknowledge || !acknowledged)) { setFeedback("Acknowledge only for yourself and confirm that the observation occurred. The observer submits first."); return; }
      setPending(true); setFeedback("");
      try {
        const response = await postFacultyAction<{ form: FacultyAssessment; message: string }>("assessment", {
          action: step < 3 ? "save" : "acknowledge", revision: current.revision,
          ...(current.participation === "observer" ? { responses } : {}), ...(step === 3 ? { acknowledged: true } : {}),
        });
        setForm(response.form); setFeedback(response.message);
        if (step < 3) move(step + 1);
      } catch (error) { setFeedback(error instanceof Error ? error.message : "The form could not be saved."); }
      finally { setPending(false); }
    }}>
      <div className={panel} hidden={step !== 1}>
        <p className="border-b border-border pb-ah-24">{current.course}.{current.section} · {current.signatureLabels.observer}: {current.observer} · {current.signatureLabels.observee}: {current.observee} · {current.scheduledAt && new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: current.timeZone }).format(new Date(current.scheduledAt))}</p>
        <h2 className="text-section">Scale questions</h2><p className="text-muted">{current.description ?? current.title}</p>
        {ratings.map(criterion => <AssessmentRatingField key={criterion.id} label={criterion.prompt} required={criterion.required} value={typeof responses.answers[criterion.id] === "number" ? responses.answers[criterion.id] as number : null}
          readOnly={!current.canEdit || pending} options={criterion.options ?? []}
          onChange={value => answer(criterion.id, value)} />)}
        {!ratings.length && <p className="text-muted">This template has no scale questions.</p>}
      </div>
      <div className={panel} hidden={step !== 2}>
        {text.map(criterion => <Textarea key={criterion.id} label={criterion.prompt} required={criterion.required} rows={3} wrapperClassName="max-w-[480px]" readOnly={!current.canEdit || pending} value={String(responses.answers[criterion.id] ?? "")} onChange={event => answer(criterion.id, event.target.value)} />)}
        {!text.length && <p className="text-muted">This template has no long response questions.</p>}
      </div>
      <div className={panel} hidden={step !== 3}>
        {current.commentPrompts.slice().sort((a, b) => a.order - b.order).map(prompt => <Textarea key={prompt.id} label={prompt.prompt} required={prompt.required} rows={3} wrapperClassName="max-w-[480px]" readOnly={!current.canEdit || pending} value={responses.promptAnswers?.[prompt.id] ?? ""} onChange={event => setResponses(previous => ({ ...previous, promptAnswers: { ...previous.promptAnswers, [prompt.id]: event.target.value } }))} />)}
        <Textarea label="Additional Comments" rows={3} wrapperClassName="max-w-[480px]" readOnly={!current.canEdit || pending} value={responses.comments} onChange={event => setResponses(previous => ({ ...previous, comments: event.target.value }))} />
        <h2 className="border-t border-border pt-ah-24 text-section">Signatures</h2>
        <div className="grid gap-ah-24 md:grid-cols-2"><Input label={current.signatureLabels.observer} readOnly value={current.observerSignedAt ? `${current.observer} · Acknowledged` : "Awaiting observer acknowledgement"} /><Input label={current.signatureLabels.observee} readOnly value={current.observeeSignedAt ? `${current.observee} · Acknowledged` : "Awaiting observee acknowledgement"} /></div>
        <p className="text-caption text-muted">Each participant acknowledges separately that the observation occurred. Acknowledgement does not mean agreement with the ratings. Answers cannot change after the observer submits; both acknowledgements finalize and lock the form.</p>
        {current.canAcknowledge && <label className="flex items-start gap-ah-12 text-label"><input type="checkbox" checked={acknowledged} disabled={pending} onChange={event => setAcknowledged(event.target.checked)} />I acknowledge that this observation occurred.</label>}
        {current.locked && <p role="status">This form is finalized and locked.</p>}
      </div>
      {feedback && <p role="status" className="rounded-ah-8 bg-neutral-bg p-ah-16 text-ink">{feedback}</p>}
      <div className="flex flex-wrap gap-ah-16">{step > 1 && <Button variant="secondary" className="min-w-[200px]" disabled={pending} onClick={() => move(step - 1)}>Back</Button>}<Button type="submit" className="min-w-[240px]" disabled={pending || (step === 3 && (current.locked || !current.canAcknowledge))} aria-busy={pending}>{pending ? "Saving…" : step === 3 ? "Submit Form" : "Next"}</Button><ButtonLink variant="secondary" href={facultyRoutes.details}>Cancel</ButtonLink></div>
    </form>
  </div>;
}
