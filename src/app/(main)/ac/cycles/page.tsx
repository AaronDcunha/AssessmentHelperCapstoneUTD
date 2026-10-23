"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useApiResource } from "@/components/ac/use-api-resource";
import { ButtonLink } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { acApi, cycleDisplayName, type Cycle } from "@/lib/ac-api";

type CycleRow = Cycle & { demo?: boolean };

const DEMO_CYCLES: CycleRow[] = [
  { id: "demo-cycle-open", semester: { title: "Fall 20XX" }, status: "Open", demo: true },
  { id: "demo-cycle-closed-1", semester: { title: "Fall 20XX" }, status: "Closed", demo: true },
  { id: "demo-cycle-closed-2", semester: { title: "Fall 20XX" }, status: "Closed", demo: true },
  { id: "demo-cycle-closed-3", semester: { title: "Fall 20XX" }, status: "Closed", demo: true },
];
const date = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—";
const cycleDate = (cycle: CycleRow, value?: string | null) => cycle.demo ? "Date" : date(value);

function CycleActionsMenu({ cycle }: { cycle: CycleRow }) {
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

export default function EvaluationCyclesPage() {
  const result = useApiResource<CycleRow[]>(useCallback(() => acApi.getEvaluationCycles(), []), DEMO_CYCLES);
  return (
    <div className="space-y-ah-24">
      <section className="space-y-ah-16" aria-labelledby="cycles-heading">
        <h2 id="cycles-heading" className="text-section text-ink">Current and previous cycles</h2>
        <ButtonLink href="/ac/cycles/new" className="w-[260px]">Create Cycle</ButtonLink>
        {result.error && <p className="text-caption text-muted">Showing temporary demo cycle data while the API is unavailable.</p>}
      </section>
      <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col style={{ width: "19%" }} /><col style={{ width: "19%" }} /><col style={{ width: "21%" }} /><col style={{ width: "21%" }} /><col style={{ width: "14%" }} /><col style={{ width: "6%" }} /></colgroup>
          <thead><tr className="h-[81px] bg-canvas">
            {["Cycle", "Signup deadline", "Observation deadline", "Feedback deadline", "Status", ""].map((heading, index) => <TableCell key={`${heading}-${index}`} variant="header" className="h-[80px]!">{heading}</TableCell>)}
          </tr></thead>
          <tbody>
            {result.data.map((cycle) => (
              <tr key={cycle.id} className="h-[81px] border-t border-border">
                <TableCell className="h-[80px]!">{cycleDisplayName(cycle)}</TableCell><TableCell className="h-[80px]!">{cycleDate(cycle, cycle.signupDeadline)}</TableCell>
                <TableCell className="h-[80px]!">{cycleDate(cycle, cycle.observationDeadline)}</TableCell><TableCell className="h-[80px]!">{cycleDate(cycle, cycle.feedbackDeadline)}</TableCell>
                <TableCell className="h-[80px]!">{cycle.status ?? "—"}</TableCell>
                <TableCell className="h-[80px]! px-ah-0! text-center"><CycleActionsMenu cycle={cycle} /></TableCell>
              </tr>
            ))}
            {!result.loading && result.data.length === 0 && <tr><td colSpan={6} className="h-[80px] px-ah-12 text-body text-muted">
              {result.error ? "Evaluation cycle data is currently unavailable." : "No evaluation cycles are available."}
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
