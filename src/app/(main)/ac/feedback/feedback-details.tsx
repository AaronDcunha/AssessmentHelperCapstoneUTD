"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextAction } from "@/components/ui/text-action";

type FeedbackDetailsProps = {
  faculty: string;
  role: string;
  course: string;
  submitted: string;
  satisfaction: string;
  difficulties: string | null;
  suggestions: string | null;
};

export function FeedbackDetails({ faculty, role, course, submitted, satisfaction, difficulties, suggestions }: FeedbackDetailsProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return <>
    <TextAction ref={opener} aria-haspopup="dialog" aria-label={`View feedback details for ${faculty}, ${role}`} onClick={() => {
      dialog.current?.showModal();
      setOpen(true);
    }}>View details</TextAction>
    <dialog ref={dialog} aria-labelledby={titleId} onClose={() => { setOpen(false); opener.current?.focus(); }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(720px,calc(100vw-32px))] overflow-y-auto rounded-ah-8 border border-border bg-surface p-ah-24 text-ink backdrop:bg-ink/40">
      <div className="space-y-ah-24">
        <header className="space-y-ah-4 border-b border-border pb-ah-16">
          <h2 id={titleId} className="text-section">Feedback details</h2>
          <p className="text-muted">{faculty} · {role} · {course}</p>
          <p className="text-caption text-muted">Submitted {submitted}</p>
        </header>
        <section className="space-y-ah-8">
          <h3 className="text-label">Satisfaction rating</h3>
          <p className="inline-block rounded-ah-8 bg-light px-ah-12 py-ah-4 text-label tabular-nums text-sidebar">{satisfaction === "—" ? "Not rated" : satisfaction}</p>
        </section>
        {open && <>
          <section className="space-y-ah-8 border-t border-border pt-ah-16">
            <h3 className="text-label">Difficulties</h3>
            <p className="whitespace-pre-wrap text-body [overflow-wrap:anywhere]">{difficulties?.trim() ? difficulties : "No difficulties provided."}</p>
          </section>
          <section className="space-y-ah-8 border-t border-border pt-ah-16">
            <h3 className="text-label">Suggestions</h3>
            <p className="whitespace-pre-wrap text-body [overflow-wrap:anywhere]">{suggestions?.trim() ? suggestions : "No suggestions provided."}</p>
          </section>
        </>}
        <form method="dialog" className="flex justify-end border-t border-border pt-ah-16"><Button type="submit" autoFocus>Close</Button></form>
      </div>
    </dialog>
  </>;
}
