import { Section } from "@/components/ui/section";
import { AssessmentRatingField } from "@/components/observations/assessment-rating-field";
import { assessmentDate } from "@/lib/ac-assessment";
import type { AssignedObservationTemplate, ObservationAssessment } from "@/lib/ac-api";

// A display-only component: no form, save, submit, acknowledgement or upload actions.
export function AssessmentView({ template, assessment }: {
  template: AssignedObservationTemplate; assessment: ObservationAssessment;
}) {
  const answers = new Map(assessment.answers.map(answer => [answer.criterionId, answer.value]));
  const comments = new Map(assessment.comments.map(comment => [comment.promptId, comment.text]));
  return <Section title="Assessment" description={template.title} contentClassName="space-y-ah-24">
    <dl className="grid gap-ah-16 sm:grid-cols-2">
      <div><dt className="text-label text-muted">Status</dt><dd className="text-body text-ink">{assessment.status || "—"}</dd></div>
      <div><dt className="text-label text-muted">Submitted</dt><dd className="text-body text-ink">{assessmentDate(assessment.submittedAt)}</dd></div>
    </dl>
    <ol className="space-y-ah-24" aria-label="Assessment questions and answers">
      {[...template.criteria].sort((a, b) => a.order - b.order).map(question => {
        const value = answers.get(question.id);
        const missing = value == null || typeof value === "string" && !value.trim();
        const rating = question.type.toLowerCase() === "rating" && typeof value === "number"
          && question.options?.some(option => option.value === value);
        return <li key={question.id} className="border-t border-border pt-ah-16">
          {rating ? <AssessmentRatingField label={question.prompt} options={question.options!} value={value as number}
            name={`assessment-${assessment.id}-${question.id}`} readOnly onChange={() => {}} /> : <div className="space-y-ah-8">
            <h3 className="text-label text-ink">{question.prompt}</h3>
            <p className={`whitespace-pre-wrap break-words text-body ${missing ? "text-muted" : "text-ink"}`}>{missing ? "Not answered" : String(value)}</p>
          </div>}
        </li>;
      })}
    </ol>
    {template.commentPrompts.length > 0 && <div className="space-y-ah-16">
      <h3 className="text-section text-ink">Comments</h3>
      {[...template.commentPrompts].sort((a, b) => a.order - b.order).map((prompt, index) => {
        const comment = prompt.id ? comments.get(prompt.id) : undefined;
        return <div key={prompt.id ?? index} className="space-y-ah-8">
          <h4 className="text-label text-ink">{prompt.prompt}</h4>
          <p className={`whitespace-pre-wrap break-words text-body ${comment?.trim() ? "text-ink" : "text-muted"}`}>{comment?.trim() ? comment : "Not answered"}</p>
        </div>;
      })}
    </div>}
    <div className="space-y-ah-8">
      <h3 className="text-section text-ink">Acknowledgements</h3>
      {assessment.acknowledgements.length === 0 ? <p className="text-body text-muted">No acknowledgements recorded.</p> : <ul className="space-y-ah-8">
        {assessment.acknowledgements.map((acknowledgement, index) => {
          const role = acknowledgement.participantRole.toLowerCase();
          const label = role === "observer" ? template.signatureLabels.observer : role === "observee" ? template.signatureLabels.observee : acknowledgement.participantRole;
          return <li key={`${acknowledgement.actorId}-${index}`} className="text-body text-ink">{label}: {assessmentDate(acknowledgement.acknowledgedAt)}</li>;
        })}
      </ul>}
    </div>
  </Section>;
}
