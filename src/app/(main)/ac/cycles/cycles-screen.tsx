"use client";

import { useAcCycle } from "@/components/ac/cycle-context";
import { Button, ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { TableCell } from "@/components/ui/table";
import { cycleDisplayName } from "@/lib/ac-api";
import { deadlineDisplay } from "@/lib/ac-configuration";

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
        <table className="w-full min-w-[1040px] table-fixed border-collapse">
          <colgroup><col style={{ width: "18%" }} /><col style={{ width: "19%" }} /><col style={{ width: "19%" }} /><col style={{ width: "19%" }} /><col style={{ width: "12%" }} /><col style={{ width: "13%" }} /></colgroup>
          <thead><tr className="h-[81px] bg-canvas">
            {["Cycle", "Signup deadline", "Observation deadline", "Feedback deadline", "Status", "Action"].map((heading, index) => <TableCell key={`${heading}-${index}`} variant="header" className="h-[80px]! w-auto!">{heading}</TableCell>)}
          </tr></thead>
          <tbody className="[&_td]:w-auto!">
            {cycles.map((cycle) => (
              <tr key={cycle.id} className="h-[81px] border-t border-border">
                <TableCell className="h-[80px]!">{cycleDisplayName(cycle)}<span className="block text-caption text-muted">{cycle.semester?.timeZone ?? "UTC (zone unavailable)"}</span></TableCell><TableCell className="h-[80px]!">{deadlineDisplay(cycle.signupDeadline, cycle.semester?.timeZone)}</TableCell>
                <TableCell className="h-[80px]!">{deadlineDisplay(cycle.observationDeadline, cycle.semester?.timeZone)}</TableCell><TableCell className="h-[80px]!">{deadlineDisplay(cycle.feedbackDeadline, cycle.semester?.timeZone)}</TableCell>
                <TableCell className="h-[80px]!">{cycle.status ?? "—"}</TableCell>
                <TableCell className="h-[80px]! w-auto!">{canManage && cycle.allowedActions?.includes("update") && <ButtonLink href={`/ac/cycles/${cycle.id}/edit`} variant="secondary" className="whitespace-nowrap" aria-label={`Edit ${cycleDisplayName(cycle)}`}>Edit Cycle</ButtonLink>}</TableCell>
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

