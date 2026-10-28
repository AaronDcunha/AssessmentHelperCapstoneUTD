"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useAcCycle } from "@/components/ac/cycle-context";
import { Button, ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { TableCell } from "@/components/ui/table";
import { cycleDisplayName, type Cycle } from "@/lib/ac-api";
import { deadlineDisplay } from "@/lib/ac-configuration";

function CycleActionsMenu({ cycle }: { cycle: Cycle }) {
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const editLink = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  const name = cycleDisplayName(cycle);

  useEffect(() => {
    if (!open) return;
    editLink.current?.focus();

    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative inline-flex h-11 w-[66px]" onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button ref={trigger} type="button" aria-label={`Actions for ${name}`} aria-haspopup="menu"
        aria-expanded={open} aria-controls={menuId}
        className="inline-flex h-11 w-[66px] items-center justify-center rounded-ah-8 p-ah-12 text-label text-sidebar hover:bg-canvas"
        onClick={() => setOpen((value) => !value)}>…</button>
      <div id={menuId} role="menu" hidden={!open}
        className="absolute right-ah-16 top-10 z-50 flex h-[52px] w-[180px] flex-col items-start overflow-hidden rounded-ah-8 border border-border bg-surface p-ah-4">
        <Link ref={editLink} role="menuitem" href={`/ac/cycles/${cycle.id}/edit`}
          className="flex h-11 w-[172px] items-center justify-center rounded-ah-8 p-ah-12 text-label text-sidebar hover:bg-canvas"
          onClick={() => setOpen(false)}>Edit Cycle</Link>
      </div>
    </div>
  );
}

export default function EvaluationCyclesPage({ canManage }: { canManage: boolean }) {
  const { cycles, loading, error, refreshCycles } = useAcCycle();
  return (
    <div className="space-y-ah-24">
      <Section variant="plain" title="Current and previous cycles" contentClassName="space-y-ah-16">
        {canManage && <ButtonLink href="/ac/cycles/new" className="w-[260px]">Create Cycle</ButtonLink>}
        {error && <div className="space-y-ah-12"><p role="alert" className="text-danger">{error}</p><Button variant="secondary" onClick={refreshCycles}>Retry cycles</Button></div>}
        {loading && <p role="status" className="text-muted">Loading evaluation cycles…</p>}
      </Section>
      <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface">
        <table className="w-full min-w-[760px] table-fixed border-collapse">
          <colgroup><col style={{ width: "19%" }} /><col style={{ width: "19%" }} /><col style={{ width: "21%" }} /><col style={{ width: "21%" }} /><col style={{ width: "14%" }} /><col style={{ width: "6%" }} /></colgroup>
          <thead><tr className="h-[81px] bg-canvas">
            {["Cycle", "Signup deadline", "Observation deadline", "Feedback deadline", "Status", ""].map((heading, index) => <TableCell key={`${heading}-${index}`} variant="header" className="h-[80px]!">{heading}</TableCell>)}
          </tr></thead>
          <tbody>
            {cycles.map((cycle) => (
              <tr key={cycle.id} className="h-[81px] border-t border-border">
                <TableCell className="h-[80px]!">{cycleDisplayName(cycle)}<span className="block text-caption text-muted">{cycle.semester?.timeZone ?? "UTC (zone unavailable)"}</span></TableCell><TableCell className="h-[80px]!">{deadlineDisplay(cycle.signupDeadline, cycle.semester?.timeZone)}</TableCell>
                <TableCell className="h-[80px]!">{deadlineDisplay(cycle.observationDeadline, cycle.semester?.timeZone)}</TableCell><TableCell className="h-[80px]!">{deadlineDisplay(cycle.feedbackDeadline, cycle.semester?.timeZone)}</TableCell>
                <TableCell className="h-[80px]!">{cycle.status ?? "—"}</TableCell>
                <TableCell className="h-[80px]! px-ah-0! text-center">{canManage && cycle.allowedActions?.includes("update") && <CycleActionsMenu cycle={cycle} />}</TableCell>
              </tr>
            ))}
            {!loading && cycles.length === 0 && <tr><td colSpan={6} className="h-[80px] px-ah-12 text-body text-muted">
              {error ? "Evaluation cycle data is currently unavailable." : "No evaluation cycles are available."}
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

