"use client";

import { useEffect, useState } from "react";
import { AssessmentQuestionEditor } from "@/components/ac/assessment-question-editor";
import { Button } from "@/components/ui/button";
import { acApi, CURRENT_CYCLE_ID } from "@/lib/ac-api";

type Question = { id: string; value: string };

const initialQuestions: Question[] = [
  { id: "question-1", value: "The instructor clearly communicated the learning objectives." },
  { id: "question-2", value: "The course content was organized and presented effectively." },
  { id: "question-3", value: "The instructor encouraged student participation and engagement." },
  { id: "question-4", value: "The instructor used appropriate teaching methods and materials." },
  { id: "question-5", value: "The instructor assessed student understanding and provided feedback." },
];

export function ObservationTemplateEditor() {
  const [questions, setQuestions] = useState(initialQuestions);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    acApi.getCurrentTemplate(CURRENT_CYCLE_ID).then((template) => {
      if (!active) return;
      setTemplateId(template.id);
      setRevision(template.revision ?? 0);
      if (template.criteria.length > 0) setQuestions(template.criteria.map((criterion) => ({
        id: criterion.id,
        value: criterion.prompt || criterion.questionText || criterion.label || "",
      })));
    }).catch(() => { if (active) setMessage("The saved template is currently unavailable. Default questions are shown."); });
    return () => { active = false; };
  }, []);

  function updateQuestion(id: string, value: string) {
    setQuestions((current) => current.map((question) => question.id === id ? { ...question, value } : question));
  }

  function removeQuestion(id: string) {
    setQuestions((current) => current.filter((question) => question.id !== id));
  }

  function addQuestion() {
    setQuestions((current) => [...current, { id: `question-${Date.now()}`, value: "" }]);
  }

  async function saveTemplate() {
    setSaving(true);
    setMessage(null);
    const weight = questions.length ? 100 / questions.length : 0;
    const body = {
      title: "Faculty observation form",
      criteria: questions.map((question) => ({ id: question.id, prompt: question.value, required: true, weight })),
      commentPrompts: [], signatureLabels: [],
    };
    try {
      const template = templateId
        ? await acApi.updateTemplate(templateId, { ...body, expectedRevision: revision })
        : await acApi.createTemplate(body);
      setTemplateId(template.id);
      setRevision(template.revision ?? revision);
      setMessage("Template saved.");
    } catch { setMessage("Unable to save the template because the API endpoint is not available yet."); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col">
      <div className="flex h-ah-48 items-center justify-between">
        <h2 className="text-section text-ink">Faculty observation form</h2>
        <Button variant="secondary" className="w-[200px]">Preview form</Button>
      </div>

      <div className="mt-ah-24 flex h-11 gap-ah-12">
        <Button className="w-[200px]">1&nbsp; Scale questions</Button>
        <Button variant="secondary" className="w-[200px]">2&nbsp; Long responses</Button>
        <Button variant="secondary" className="w-[200px]">3&nbsp; Comments &amp; signatures</Button>
      </div>

      <div className="mt-ah-24 flex h-ah-64 flex-col gap-ah-8">
        <h3 className="text-section text-ink">Scale questions</h3>
        <p className="text-body text-muted">Edit the questions Faculty will answer using the same five-point scale.</p>
      </div>

      <div className="mt-ah-24 flex h-ah-48 items-center gap-ah-24 rounded-ah-8 bg-neutral-bg px-ah-12 text-caption text-muted">
        <span className="text-label text-ink">Response scale</span>
        <span>1&nbsp; Unsatisfactory</span><span>2&nbsp; Needs improvement</span><span>3&nbsp; Satisfactory</span>
        <span>4&nbsp; Good</span><span>5&nbsp; Excellent</span>
      </div>

      <div className="mt-ah-24 space-y-ah-12">
        {questions.map((question, index) => (
          <AssessmentQuestionEditor key={question.id} questionId={question.id} questionNumber={index + 1}
            value={question.value} onChange={updateQuestion} onRemove={removeQuestion} />
        ))}
      </div>

      <div className="mt-ah-24 flex h-11 items-center justify-between">
        <Button variant="secondary" className="w-[200px]" onClick={addQuestion}>+ Add question</Button>
        <p className="text-label text-muted">{questions.length} questions</p>
      </div>

      {message && <p className="mt-ah-16 text-body text-muted" role="status">{message}</p>}

      <div className="mt-ah-24 flex h-11 items-center justify-between">
        <button type="button" className="h-11 w-[200px] rounded-ah-8 text-label text-sidebar">Cancel</button>
        <div className="flex gap-ah-12">
          <Button className="w-[200px]" onClick={saveTemplate} disabled={saving}>{saving ? "Saving…" : "Save template"}</Button>
          <Button variant="secondary" className="w-[200px]">Next section →</Button>
        </div>
      </div>
    </div>
  );
}
