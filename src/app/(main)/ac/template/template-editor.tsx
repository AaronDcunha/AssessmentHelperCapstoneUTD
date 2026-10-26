"use client";

import { useEffect, useState } from "react";
import { AssessmentQuestionEditor } from "@/components/ac/assessment-question-editor";
import { AssessmentRatingField } from "@/components/observations/assessment-rating-field";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { acApi, type ObservationTemplate } from "@/lib/ac-api";
import { nextTemplateSection, previousTemplateSection, type TemplateSection } from "@/lib/ac-template-sections";

type EditableQuestion = { localId: string; apiId?: string; key: string; value: string };
type EditablePrompt = { localId: string; apiId?: string; value: string };

let localId = 0;
const newLocalId = (prefix: string) => `${prefix}-${++localId}`;

const initialScaleQuestions: EditableQuestion[] = [
  { localId: "scale-1", key: "learning-objectives", value: "The instructor clearly communicated the learning objectives." },
  { localId: "scale-2", key: "course-organization", value: "The course content was organized and presented effectively." },
  { localId: "scale-3", key: "student-engagement", value: "The instructor encouraged student participation and engagement." },
  { localId: "scale-4", key: "teaching-methods", value: "The instructor used appropriate teaching methods and materials." },
  { localId: "scale-5", key: "student-understanding", value: "The instructor assessed student understanding and provided feedback." },
];

const initialCommentPrompts: EditablePrompt[] = [
  { localId: "comment-1", value: "Strengths" },
  { localId: "comment-2", value: "Opportunities for improvement" },
];

const ratingOptions = [
  { value: 1, label: "Unsatisfactory" },
  { value: 2, label: "Needs improvement" },
  { value: 3, label: "Satisfactory" },
  { value: 4, label: "Good" },
  { value: 5, label: "Excellent" },
] as const;

function editableCriteria(template: ObservationTemplate, type: "rating" | "text"): EditableQuestion[] {
  return template.criteria.filter((criterion) => criterion.type === type).map((criterion) => ({
    localId: criterion.id,
    apiId: criterion.id,
    key: criterion.key,
    value: criterion.prompt,
  }));
}

export function ObservationTemplateEditor() {
  const [section, setSection] = useState<TemplateSection>("scale");
  const [scaleQuestions, setScaleQuestions] = useState(initialScaleQuestions);
  const [longResponses, setLongResponses] = useState<EditableQuestion[]>([]);
  const [commentPrompts, setCommentPrompts] = useState(initialCommentPrompts);
  const [signatureLabels, setSignatureLabels] = useState({ observer: "Observer", observee: "Observee" });
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    acApi.getCurrentTemplate().then((template) => {
      if (!active) return;
      setTemplateId(template.id);
      setRevision(template.revision ?? 0);
      const ratings = editableCriteria(template, "rating");
      setScaleQuestions(ratings.length > 0 ? ratings : initialScaleQuestions);
      setLongResponses(editableCriteria(template, "text"));
      setCommentPrompts(template.commentPrompts.map((prompt, index) => ({
        localId: prompt.id ?? `loaded-comment-${index}`,
        apiId: prompt.id,
        value: prompt.prompt,
      })));
      setSignatureLabels(template.signatureLabels);
    }).catch(() => { if (active) setMessage("The saved template is currently unavailable. Default questions are shown."); });
    return () => { active = false; };
  }, []);

  function updateQuestion(setter: typeof setScaleQuestions, id: string, value: string) {
    setter((current) => current.map((question) => question.localId === id ? { ...question, value } : question));
  }

  function removeQuestion(setter: typeof setScaleQuestions, id: string) {
    setter((current) => current.filter((question) => question.localId !== id));
  }

  function addQuestion(setter: typeof setScaleQuestions, type: "rating" | "text") {
    setter((current) => [...current, { localId: newLocalId(type), key: `${type}-${Date.now()}-${current.length + 1}`, value: "" }]);
  }

  function updatePrompt(id: string, value: string) {
    setCommentPrompts((current) => current.map((prompt) => prompt.localId === id ? { ...prompt, value } : prompt));
  }

  function removePrompt(id: string) {
    setCommentPrompts((current) => current.filter((prompt) => prompt.localId !== id));
  }

  function applySavedTemplate(template: ObservationTemplate) {
    setTemplateId(template.id);
    setRevision(template.revision ?? revision);
    setScaleQuestions(editableCriteria(template, "rating"));
    setLongResponses(editableCriteria(template, "text"));
    setCommentPrompts(template.commentPrompts.map((prompt, index) => ({
      localId: prompt.id ?? `saved-comment-${index}`,
      apiId: prompt.id,
      value: prompt.prompt,
    })));
    setSignatureLabels(template.signatureLabels);
  }

  async function saveTemplate() {
    setSaving(true);
    setMessage(null);
    const ratingCriteria = scaleQuestions.map((question, order) => ({
      id: question.apiId, key: question.key, prompt: question.value, type: "rating" as const,
      required: true, order, options: ratingOptions.map((option) => ({ ...option })), weight: 1,
    }));
    const textCriteria = longResponses.map((question, index) => ({
      id: question.apiId, key: question.key, prompt: question.value, type: "text" as const,
      required: false, order: ratingCriteria.length + index, weight: 1,
    }));
    const body = {
      title: "Faculty observation form",
      criteria: [...ratingCriteria, ...textCriteria],
      commentPrompts: commentPrompts.map((prompt, order) => ({ id: prompt.apiId, prompt: prompt.value, required: false, order })),
      signatureLabels,
    };
    try {
      const template = templateId
        ? await acApi.updateTemplate(templateId, { ...body, expectedRevision: revision })
        : await acApi.createTemplate(body);
      applySavedTemplate(template);
      setMessage("Template saved.");
    } catch { setMessage("Unable to save the template. Check each section and try again."); }
    finally { setSaving(false); }
  }

  const tab = (target: TemplateSection, label: string) => (
    <Button key={target} variant={section === target ? "primary" : "secondary"} className="w-full sm:w-[200px]"
      aria-current={section === target ? "step" : undefined} onClick={() => setSection(target)}>{label}</Button>
  );

  return (
    <div className="flex flex-col">
      <div className="flex min-h-ah-48 flex-wrap items-center justify-between gap-ah-12">
        <h2 className="text-section text-ink">Faculty observation form</h2>
        <Button variant="secondary" className="w-full sm:w-[200px]" aria-expanded={previewing} aria-controls="observation-template-preview"
          onClick={() => setPreviewing((current) => !current)}>{previewing ? "Close preview" : "Preview form"}</Button>
      </div>

      {previewing && <Section id="observation-template-preview" title="Faculty observation form preview"
        description="This is how the current questions will appear to faculty. Preview entries are not saved."
        className="mt-ah-24" contentClassName="space-y-ah-24">
        <ol className="space-y-ah-24" aria-label="Observation template preview questions">
          {scaleQuestions.map((question, index) => <li key={question.localId} className={index > 0 ? "border-t border-border pt-ah-24" : undefined}>
            <AssessmentRatingField label={`${index + 1}. ${question.value.trim() || "Untitled question"}`} options={ratingOptions}
              value={null} name={`preview-${question.localId}`} readOnly onChange={() => {}} />
          </li>)}
        </ol>
        {longResponses.length > 0 && <div className="grid gap-ah-16 border-t border-border pt-ah-24 md:grid-cols-2">
          {longResponses.map((question) => <Textarea key={question.localId} label={question.value.trim() || "Untitled long response"} value="" readOnly placeholder="Faculty response" />)}
        </div>}
        {commentPrompts.length > 0 && <div className="grid gap-ah-16 border-t border-border pt-ah-24 md:grid-cols-2">
          {commentPrompts.map((prompt) => <Textarea key={prompt.localId} label={`${prompt.value.trim() || "Untitled comment"} (optional)`} value="" readOnly placeholder="Faculty comment" />)}
        </div>}
        <dl className="grid gap-ah-16 border-t border-border pt-ah-24 sm:grid-cols-2">
          <div><dt className="text-label text-muted">Observer signature</dt><dd className="text-body text-ink">{signatureLabels.observer}</dd></div>
          <div><dt className="text-label text-muted">Observee signature</dt><dd className="text-body text-ink">{signatureLabels.observee}</dd></div>
        </dl>
      </Section>}

      <nav className="mt-ah-24 flex flex-wrap gap-ah-12" aria-label="Observation template sections">
        {tab("scale", "1  Scale questions")}
        {tab("long-responses", "2  Long responses")}
        {tab("comments-signatures", "3  Comments & signatures")}
      </nav>

      {section === "scale" && <>
        <div className="mt-ah-24 flex min-h-ah-64 flex-col gap-ah-8">
          <h3 className="text-section text-ink">Scale questions</h3>
          <p className="text-body text-muted">Edit the questions faculty will answer using the same five-point scale.</p>
        </div>
        <div className="mt-ah-24 flex min-h-ah-48 flex-wrap items-center gap-x-ah-24 gap-y-ah-8 rounded-ah-8 bg-neutral-bg px-ah-12 py-ah-8 text-caption text-muted">
          <span className="text-label text-ink">Response scale</span>
          {ratingOptions.map((option) => <span key={option.value}>{option.value}&nbsp; {option.label}</span>)}
        </div>
        <div className="mt-ah-24 space-y-ah-12">
          {scaleQuestions.map((question, index) => <AssessmentQuestionEditor key={question.localId} questionId={question.localId}
            questionNumber={index + 1} value={question.value} onChange={(id, value) => updateQuestion(setScaleQuestions, id, value)}
            onRemove={(id) => removeQuestion(setScaleQuestions, id)} />)}
        </div>
        <div className="mt-ah-24 flex flex-wrap items-center justify-between gap-ah-12">
          <Button variant="secondary" className="w-full sm:w-[200px]" onClick={() => addQuestion(setScaleQuestions, "rating")}>+ Add question</Button>
          <p className="text-label text-muted">{scaleQuestions.length} questions</p>
        </div>
      </>}

      {section === "long-responses" && <>
        <div className="mt-ah-24 flex min-h-ah-64 flex-col gap-ah-8">
          <h3 className="text-section text-ink">Long responses</h3>
          <p className="text-body text-muted">Add optional questions that faculty answer in their own words.</p>
        </div>
        <div className="mt-ah-24 space-y-ah-12">
          {longResponses.map((question, index) => <AssessmentQuestionEditor key={question.localId} questionId={question.localId}
            questionNumber={index + 1} value={question.value} onChange={(id, value) => updateQuestion(setLongResponses, id, value)}
            onRemove={(id) => removeQuestion(setLongResponses, id)} />)}
          {longResponses.length === 0 && <p className="rounded-ah-8 border border-border bg-surface p-ah-24 text-body text-muted">No long-response questions have been added.</p>}
        </div>
        <div className="mt-ah-24 flex flex-wrap items-center justify-between gap-ah-12">
          <Button variant="secondary" className="w-full sm:w-[200px]" onClick={() => addQuestion(setLongResponses, "text")}>+ Add response</Button>
          <p className="text-label text-muted">{longResponses.length} responses</p>
        </div>
      </>}

      {section === "comments-signatures" && <>
        <div className="mt-ah-24 flex min-h-ah-64 flex-col gap-ah-8">
          <h3 className="text-section text-ink">Comments &amp; signatures</h3>
          <p className="text-body text-muted">Configure optional closing comments and participant acknowledgement labels.</p>
        </div>
        <div className="mt-ah-24 space-y-ah-12">
          {commentPrompts.map((prompt, index) => <AssessmentQuestionEditor key={prompt.localId} questionId={prompt.localId}
            questionNumber={index + 1} value={prompt.value} onChange={updatePrompt} onRemove={removePrompt} />)}
          <Button variant="secondary" className="w-full sm:w-[200px]"
            onClick={() => setCommentPrompts((current) => [...current, { localId: newLocalId("comment"), value: "" }])}>+ Add comment</Button>
        </div>
        <div className="mt-ah-24 grid gap-ah-16 md:grid-cols-2">
          <Input label="Observer signature label" value={signatureLabels.observer}
            onChange={(event) => setSignatureLabels((current) => ({ ...current, observer: event.target.value }))} />
          <Input label="Observee signature label" value={signatureLabels.observee}
            onChange={(event) => setSignatureLabels((current) => ({ ...current, observee: event.target.value }))} />
        </div>
      </>}

      {message && <p className="mt-ah-16 text-body text-muted" role="status">{message}</p>}

      <div className="mt-ah-24 flex flex-wrap items-center justify-between gap-ah-12">
        <button type="button" className="h-11 w-full rounded-ah-8 text-label text-sidebar sm:w-[200px]">Cancel</button>
        <div className="flex w-full flex-wrap gap-ah-12 sm:w-auto">
          {section !== "scale" && <Button variant="secondary" className="w-full sm:w-[200px]"
            onClick={() => setSection(previousTemplateSection(section))}>← Previous section</Button>}
          <Button className="w-full sm:w-[200px]" onClick={saveTemplate} disabled={saving}>{saving ? "Saving…" : "Save template"}</Button>
          {section !== "comments-signatures" && <Button variant="secondary" className="w-full sm:w-[200px]"
            onClick={() => setSection(nextTemplateSection(section))}>Next section →</Button>}
        </div>
      </div>
    </div>
  );
}
