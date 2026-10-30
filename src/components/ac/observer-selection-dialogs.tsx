"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import type { ObservationCandidatesResponse, ObserverSelectionSignup } from "@/lib/ac-api";
import { candidateMeetings, courseHistoryLabel, proposedMeetingsLabel, signupCourseLabel } from "@/lib/observer-selection";

function DialogFrame({ open, onClose, labelledBy, describedBy, className, children }: {
  open: boolean; onClose: () => void; labelledBy: string; describedBy?: string; className: string; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    element.showModal();
    document.documentElement.style.overflow = "hidden";
    element.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    return () => {
      element.close();
      document.documentElement.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);

  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled)");
    if (!controls?.length) return;
    const first = controls[0], last = controls[controls.length - 1], active = document.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  if (!open) return null;
  return createPortal(<dialog ref={dialog} aria-labelledby={labelledBy} aria-describedby={describedBy}
    className={`m-auto max-h-[calc(100dvh_-_2rem)] max-w-[calc(100%_-_2rem)] overflow-y-auto rounded-ah-8 border border-border bg-surface text-ink backdrop:bg-ink/40 ${className}`}
    onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={keepFocusInside}>{children}</dialog>, document.body);
}

export function CandidateReviewDialog({ open, signup, candidates, loading, error, canRegenerate, regenerating, onClose, onRegenerate }: {
  open: boolean; signup: ObserverSelectionSignup | null; candidates: ObservationCandidatesResponse | null;
  loading: boolean; error: string | null; canRegenerate: boolean; regenerating: boolean;
  onClose: () => void; onRegenerate: () => void;
}) {
  const id = useId();
  if (!signup) return null;
  return <DialogFrame open={open} onClose={onClose} labelledBy={`${id}-title`} describedBy={`${id}-description`}
    className="w-[1096px] p-ah-16">
    <div className="space-y-ah-4">
      <h2 id={`${id}-title`} className="text-section text-ink">{signup.observee.name || signup.observee.displayName || signup.observee.username || "Observee"} · Eligible observers</h2>
      <p id={`${id}-description`} className="text-caption text-muted">{signupCourseLabel(signup)} · Same department and course level · Compatible proposed meetings</p>
      <div className="overflow-x-auto pt-ah-4">
        <table className="w-full min-w-[900px] border-collapse">
          <thead><tr>
            <TableCell variant="header" className="w-[300px]!">Observer</TableCell>
            <TableCell variant="header" className="w-[300px]!">Course history</TableCell>
            <TableCell variant="header" className="w-[464px]!">Available proposed meetings</TableCell>
          </tr></thead>
          <tbody className="[&_td>div]:min-h-0">
            {candidates?.items.map((candidate) => <tr key={candidate.id} className="border-t border-border">
              <TableCell className="h-11! w-[300px]! py-ah-8!">
                <span>{candidate.professor.name || candidate.professor.displayName || candidate.professor.username || "—"}</span>
                {candidate.status && <span className="block text-caption text-muted">{candidate.status}{candidate.responseStatus ? ` · Response: ${candidate.responseStatus}` : " · No recorded response"}</span>}
              </TableCell>
              <TableCell className="h-11! w-[300px]! py-ah-8!">{courseHistoryLabel(candidate)}</TableCell>
              <TableCell className="h-11! w-[464px]! py-ah-8!">{proposedMeetingsLabel(candidateMeetings(candidate, candidates.proposedMeetings))}</TableCell>
            </tr>)}
            {!loading && !error && (!candidates || candidates.items.length === 0) && <tr><td colSpan={3} className="p-ah-24 text-body text-muted">No eligible observers are available for this signup.</td></tr>}
            {loading && <tr><td colSpan={3} className="p-ah-24 text-body text-muted">Loading eligible observers…</td></tr>}
            {error && <tr><td colSpan={3} className="p-ah-24 text-body text-danger">{error}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-ah-16 pt-ah-12">
        <Button variant="secondary" className="w-[150px] max-w-full" onClick={onClose}>Done</Button>
        {canRegenerate && <Button variant="secondary" className="w-[190px] max-w-full" onClick={onRegenerate} disabled={regenerating || loading}>
          {regenerating ? "Regenerating…" : "Regenerate list"}
        </Button>}
      </div>
    </div>
  </DialogFrame>;
}

export type ReleaseListSummary = { observationId: string; observee: string; candidateCount: number; replacesReleasedList?: boolean };

export function ReleaseConfirmationDialog({ open, selected, unselected, pending, error, onClose, onConfirm }: {
  open: boolean; selected: readonly ReleaseListSummary[]; unselected: readonly string[]; pending: boolean; error: string | null;
  onClose: () => void; onConfirm: () => void;
}) {
  const id = useId();
  const insufficient = selected.filter((item) => item.candidateCount < 5);
  return <DialogFrame open={open} onClose={onClose} labelledBy={`${id}-title`} describedBy={`${id}-description`}
    className="w-[600px] p-ah-32">
    <div className="space-y-ah-24">
      <h2 id={`${id}-title`} className="text-section text-ink">Publish observer lists?</h2>
      {selected.some(item => item.replacesReleasedList) && <p className="text-body text-warning">Replacement publication cancels previous invitations and ends any selected observer appointment. History is preserved.</p>}
      <p id={`${id}-description`} className="text-body text-ink">{selected.length} {selected.length === 1 ? "observee" : "observees"} will receive their candidate {selected.length === 1 ? "list" : "lists"} and an in-app notification.</p>
      <ul className="space-y-ah-12 bg-canvas p-ah-16 text-label text-ink">
        {selected.map((item) => <li key={item.observationId} className={item.candidateCount < 5 ? "text-warning" : undefined}>{item.observee} · {item.candidateCount} {item.candidateCount === 1 ? "observer" : "observers"}</li>)}
      </ul>
      {insufficient.map((item) => <p key={item.observationId} className="text-body text-warning">{item.observee} has fewer than 5 matches. The list will be released with the {item.candidateCount} available {item.candidateCount === 1 ? "observer" : "observers"}.</p>)}
      {unselected.length > 0 && <p className="text-caption text-muted">{unselected.join(", ")} {unselected.length === 1 ? "is" : "are"} not selected. {unselected.length === 1 ? "This list" : "These lists"} will remain unreleased.</p>}
      {error && <p role="alert" className="text-body text-danger">{error}</p>}
      <div className="grid gap-ah-16 sm:grid-cols-[220px_1fr]">
        <Button variant="secondary" onClick={onClose} disabled={pending}>Keep Reviewing</Button>
        <Button onClick={onConfirm} disabled={pending || selected.length === 0}>{pending ? "Publishing…" : "Publish & Notify"}</Button>
      </div>
    </div>
  </DialogFrame>;
}
