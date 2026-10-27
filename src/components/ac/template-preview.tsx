"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { AssessmentRatingField } from "@/components/observations/assessment-rating-field";
import type { TemplateDraft } from "@/lib/ac-configuration";

export function TemplatePreview({ draft, onBack }: { draft: TemplateDraft; onBack: () => void }) {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  return <Section variant="plain" title={draft.title || "Untitled observation form"} description="Preview of current editor changes. Demonstration responses are not saved or submitted." actions={<Button variant="secondary" onClick={onBack}>← Return to editor</Button>} contentClassName="space-y-ah-24">
    <Section title="Questions" contentClassName="space-y-ah-24">
      {!draft.criteria.length && <p className="text-muted">No questions configured.</p>}
      {draft.criteria.map((item, index) => item.type === "rating"
        ? <AssessmentRatingField key={item.uiId} label={`${index + 1}. ${item.prompt || "Untitled question"}${item.required ? " *" : " (optional)"}`} options={item.options ?? []} value={ratings[item.uiId] ?? null} onChange={value => setRatings(current => ({ ...current, [item.uiId]: value }))} />
        : <Textarea key={item.uiId} label={`${index + 1}. ${item.prompt || "Untitled question"}${item.required ? " *" : " (optional)"}`} />)}
    </Section>
    <Section title="Comments" contentClassName="space-y-ah-16">
      {!draft.commentPrompts.length && <p className="text-muted">No comment prompts configured.</p>}
      {draft.commentPrompts.map(item => <Textarea key={item.uiId} label={`${item.prompt || "Untitled comment"}${item.required ? " *" : " (optional)"}`} />)}
    </Section>
    <Section title="Signatures" description="Labels only. This preview does not record acknowledgements or digital signatures." contentClassName="grid gap-ah-16 md:grid-cols-2">
      <Input label={draft.signatureLabels.observee || "Observee"} placeholder="Preview only" />
      <Input label={draft.signatureLabels.observer || "Observer"} placeholder="Preview only" />
    </Section>
    <p className="text-caption text-muted">* Required in the configured assessment form.</p>
    <Button variant="secondary" onClick={onBack}>← Return to editor</Button>
  </Section>;
}
