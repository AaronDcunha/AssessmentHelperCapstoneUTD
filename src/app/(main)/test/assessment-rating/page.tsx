"use client";

import { useRef, useState } from "react";
import { AssessmentRatingField, type AssessmentRatingOption } from "@/components/observations/assessment-rating-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";

const requiredScale: AssessmentRatingOption[] = [
  { value: 1, label: "Poor" },
  { value: 2, label: "Fair" },
  { value: 3, label: "Satisfactory", className: "min-w-[156px]" },
  { value: 4, label: "Good" },
  { value: 5, label: "Excellent" },
];
const sampleQuestions = [
  { id: "objectives", prompt: "Scale Question 1" },
  { id: "organization", prompt: "Scale Question 2" },
  { id: "engagement", prompt: "Scale Question 3" },
];
const alternateScale: AssessmentRatingOption[] = [
  { value: 0, label: "Sample: not demonstrated" },
  { value: 0.5, label: "Sample: partly demonstrated" },
  { value: 1, label: "Sample: demonstrated" },
];

export default function AssessmentRatingPreviewPage() {
  const [answers, setAnswers] = useState<Record<string, number | null>>({ objectives: null, organization: null, engagement: null });
  const [attempted, setAttempted] = useState(false);
  const [validation, setValidation] = useState("No validation attempted. Nothing is saved or submitted.");
  const [alternate, setAlternate] = useState<number | null>(0);
  const [customLabel, setCustomLabel] = useState("Sample: demonstrated");
  const [lockedCallbacks, setLockedCallbacks] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const result = useRef<HTMLParagraphElement>(null);

  return (
    <div className="space-y-ah-24">
      <Section title="Assessment rating fields" description="Choose one rating per question. Sample template scale: 1 Poor, 2 Fair, 3 Satisfactory, 4 Good, 5 Excellent. Tab enters a question; arrow keys change its rating; Space selects. This preview validates locally only.">
        <form
          ref={form} noValidate className="space-y-ah-16"
          onSubmit={(event) => {
            event.preventDefault();
            setAttempted(true);
            const missing = sampleQuestions.filter((question) => answers[question.id] === null);
            setValidation(missing.length ? `${missing.length} required rating(s) missing. Nothing was submitted.` : "All required ratings are selected. Nothing was saved or submitted.");
            if (missing.length) form.current?.querySelector<HTMLInputElement>(`input[name="${missing[0].id}"]`)?.focus();
            else result.current?.focus();
          }}
        >
          {sampleQuestions.map((question) => (
            <AssessmentRatingField
              key={question.id} name={question.id} label={question.prompt} options={requiredScale} required
              value={answers[question.id]} onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
              error={attempted && answers[question.id] === null ? "Choose one rating for this question." : undefined}
            />
          ))}
          <div className="flex flex-wrap gap-ah-12">
            <Button type="submit">Validate ratings</Button>
            <Button variant="secondary" onClick={() => { setAnswers({ objectives: null, organization: null, engagement: null }); setAttempted(false); setValidation("Ratings reset. Nothing was saved or submitted."); }}>Reset ratings</Button>
          </div>
          <p ref={result} tabIndex={-1} role="status" className="text-body text-muted">{validation}</p>
          <p className="break-words text-caption text-muted">Current values: {sampleQuestions.map((question) => `${question.prompt}: ${answers[question.id] ?? "unanswered"}`).join(" · ")}</p>
        </form>
      </Section>

      <Section title="Disabled and read-only" description="Disabled ratings are skipped by Tab. Read-only ratings remain focusable and preserve their value, while pointer and keyboard changes are blocked.">
        <div className="space-y-ah-24">
          <AssessmentRatingField name="disabled-rating" label="Disabled question" options={requiredScale} value={2} disabled onChange={() => setLockedCallbacks((count) => count + 1)} />
          <AssessmentRatingField name="readonly-rating" label="Read-only question" options={requiredScale} value={4} readOnly hint="Read-only. The supplied rating is Good." onChange={() => setLockedCallbacks((count) => count + 1)} />
          <p role="status" className="text-caption text-muted">Disabled/read-only callbacks triggered: {lockedCallbacks}</p>
        </div>
      </Section>

      <Section title="Configurable values and labels" description="Sample alternative template data demonstrates zero, a fractional value, and editable wording. These values and labels are supplied by this preview, not the reusable component.">
        <div className="mb-ah-24 max-w-[480px]">
          <Input label="Label for the sample rating of 1" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} />
        </div>
        <AssessmentRatingField name="alternate-rating" label="Sample alternative question" options={alternateScale.map((option) => option.value === 1 ? { ...option, label: customLabel } : option)} value={alternate} onChange={setAlternate} />
        <p role="status" className="mt-ah-16 text-body text-muted">Alternative value: {alternate ?? "unanswered"}</p>
      </Section>
    </div>
  );
}
