"use client";

import { useRef, useState } from "react";
import { AssessmentQuestionEditor } from "@/components/ac/assessment-question-editor";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";

const sampleQuestions = [
  { id: "learning-objectives", text: "The instructor clearly communicated the learning objectives." },
  { id: "organization", text: "The course content was organized and presented effectively." },
  { id: "engagement", text: "" },
];

export default function Task4PreviewPage() {
  const [questions, setQuestions] = useState(sampleQuestions);
  const [lockedCallbacks, setLockedCallbacks] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const reset = useRef<HTMLButtonElement>(null);

  function changeQuestion(questionId: string, value: string) {
    setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, text: value } : question));
  }

  function removeQuestion(questionId: string) {
    const index = questions.findIndex((question) => question.id === questionId);
    const remaining = questions.filter((question) => question.id !== questionId);
    setQuestions(remaining);
    requestAnimationFrame(() => {
      const inputs = list.current?.querySelectorAll<HTMLInputElement>("input");
      (inputs?.[Math.min(index, remaining.length - 1)] ?? reset.current)?.focus();
    });
  }

  return (
    <div className="space-y-ah-24">
      <Section
        title="Assessment questions"
        description="Edit or remove sample questions. The parent renumbers the remaining questions while retaining their IDs and text. Preview validation flags blank prompts; nothing is saved."
        actions={<Button ref={reset} variant="secondary" onClick={() => setQuestions(sampleQuestions)}>Reset questions</Button>}
      >
        <div ref={list} className="space-y-ah-12">
          {questions.map((question, index) => (
            <AssessmentQuestionEditor
              key={question.id} questionId={question.id} questionNumber={index + 1}
              value={question.text} onChange={changeQuestion} onRemove={removeQuestion}
              error={question.text.trim() ? undefined : "Enter question text."}
            />
          ))}
        </div>
        <p role="status" className="mt-ah-16 text-body text-muted">
          {questions.length === 0 ? "No questions remain. Use Reset questions to restore the examples." : `${questions.length} sample questions. Changes remain on this page only.`}
        </p>
      </Section>

      <Section title="Read-only and disabled states" description="Read-only text can be focused, selected and copied. Disabled controls are skipped by keyboard navigation. Neither mode permits editing or removal.">
        <div className="space-y-ah-12">
          <AssessmentQuestionEditor
            questionId="read-only-example" questionNumber={1} value="This question can be selected and copied."
            readOnly onChange={() => setLockedCallbacks((count) => count + 1)} onRemove={() => setLockedCallbacks((count) => count + 1)}
          />
          <AssessmentQuestionEditor
            questionId="disabled-example" questionNumber={2} value="This question is currently unavailable."
            disabled onChange={() => setLockedCallbacks((count) => count + 1)} onRemove={() => setLockedCallbacks((count) => count + 1)}
          />
        </div>
        <p role="status" className="mt-ah-16 text-caption text-muted">Read-only/disabled callbacks triggered: {lockedCallbacks}</p>
      </Section>
    </div>
  );
}
