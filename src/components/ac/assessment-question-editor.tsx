"use client";

import { useId, type ComponentProps } from "react";
import { Input } from "@/components/ui/form-fields";
import { TextAction } from "@/components/ui/text-action";

export type AssessmentQuestionEditorProps = Omit<ComponentProps<"div">, "children" | "onChange"> & {
  questionId: string;
  questionNumber: number;
  value: string;
  onChange: (questionId: string, value: string) => void;
  onRemove: (questionId: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  error?: string;
  hint?: string;
};

/** Parent owns stable IDs/keys, numbering, validation and saving. Read-only also blocks removal. */
export function AssessmentQuestionEditor({
  questionId, questionNumber, value, onChange, onRemove,
  disabled = false, readOnly = false, error, hint, className, ...props
}: AssessmentQuestionEditorProps) {
  const instanceId = useId();
  const headingId = `${instanceId}-heading`;
  const locked = disabled || readOnly;

  return (
    <div
      role="group" aria-labelledby={headingId} data-question-id={questionId}
      className={["flex min-h-[160px] w-full min-w-0 flex-col gap-ah-8 rounded-ah-8 border border-border bg-surface p-ah-16", className].filter(Boolean).join(" ")}
      {...props}
    >
      <div className="flex h-7 items-center justify-between gap-ah-8">
        <p id={headingId} className="text-label text-ink">Question {questionNumber}</p>
        <TextAction
          className="h-7 min-h-7! w-[100px] min-w-[100px]! shrink-0"
          aria-label={`Remove question ${questionNumber}`} disabled={locked}
          onClick={() => { if (!locked) onRemove(questionId); }}
        >
          Remove
        </TextAction>
      </div>
      <Input
        id={`${instanceId}-text`} name={questionId} label="Question text"
        placeholder="Enter your question" value={value}
        onChange={(event) => { if (!locked) onChange(questionId, event.target.value); }}
        disabled={disabled} readOnly={readOnly} error={error} hint={hint}
        className="h-control-56 px-ah-16 py-ah-16" wrapperClassName="min-h-control-88"
      />
    </div>
  );
}
