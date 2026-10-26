"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { CycleSelector, useAcCycle } from "@/components/ac/cycle-context";
import { DemoDataNotice } from "@/components/ac/demo-data-notice";
import { useApiResource } from "@/components/ac/use-api-resource";
import { Select } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";
import { acApi, type ObservationItem, userDisplayName } from "@/lib/ac-api";
import { demoObservations, isDemoRecord } from "@/lib/ac-demo-data";

const EMPTY_ROWS: ObservationItem[] = [];

function courseLabel(row: ObservationItem) {
  const course = typeof row.course === "string" ? row.course : row.course ?? row.section?.course;
  if (typeof course === "string") return course;
  return course?.code || course?.title || course?.name || "—";
}

export default function ObservationProgressPage() {
  const [status, setStatus] = useState("all");
  const { cycles, selectedCycle, selection } = useAcCycle();
  const cycleId = selectedCycle?.id;
  const demoRows = demoObservations(status);
  const loader = useCallback(async () => {
    const cycleIds = selection === "all" ? cycles.map(cycle => cycle.id) : cycleId ? [cycleId] : [];
    return (await Promise.all(cycleIds.map((cycleId) => acApi.getObservations(cycleId, { status })))).flat();
  }, [cycles, cycleId, selection, status]);
  const result = useApiResource(loader, EMPTY_ROWS, demoRows);

  return (
    <div className="space-y-ah-24">
      <div className="grid min-h-[88px] max-w-[976px] grid-cols-1 gap-ah-16 md:grid-cols-2">
        <Select label="Status" name="status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-control-56">
          <option value="all">All</option><option value="in-progress">In progress</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option><option value="unmatched">Unmatched</option>
        </Select>
        <CycleSelector allowAll />
      </div>
      {result.error && <DemoDataNotice />}
      <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface">
        <table className="w-full min-w-[760px] table-fixed border-collapse">
          <thead><tr className="h-[80px] bg-canvas">
            {["Observee", "Observer", "Course", "Status", "Form"].map((heading) => <TableCell key={heading} variant="header" className="h-[80px]! w-1/5!">{heading}</TableCell>)}
          </tr></thead>
          <tbody>
            {result.data.map((row) => (
              <tr key={row.id} className="h-[81px] border-t border-border">
                <TableCell className="h-[80px]!">{userDisplayName(row.observee)}</TableCell>
                <TableCell className="h-[80px]!">{userDisplayName(row.observer)}</TableCell>
                <TableCell className="h-[80px]!">{courseLabel(row)}</TableCell>
                <TableCell className="h-[80px]!">{row.status ?? "—"}</TableCell>
                <TableCell className="h-[80px]!">{isDemoRecord(row)
                  ? <span className="inline-flex min-h-9 min-w-[110px] items-center justify-center px-ah-12 text-label text-muted">Demo only</span>
                  : <Link href={`/ac/observations/${row.id}`} className="inline-flex min-h-9 min-w-[110px] items-center justify-center px-ah-12 text-label text-sidebar">View</Link>}
                </TableCell>
              </tr>
            ))}
            {!result.loading && result.data.length === 0 && <tr><td colSpan={5} className="h-[80px] px-ah-12 text-body text-muted">
              {result.error ? "Observation progress is currently unavailable." : "No observations match these filters."}
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
