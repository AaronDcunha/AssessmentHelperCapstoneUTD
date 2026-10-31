"use client";

import Link from "next/link";
import { ReminderControl } from "@/components/ac/reminder-control";
import { useCallback, useEffect, useState } from "react";
import { CycleSelector, useAcCycle } from "@/components/ac/cycle-context";
import { useApiResource } from "@/components/ac/use-api-resource";
import { Input, Select } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { loadObservationProgressPage, type ObservationPagePosition, type ObservationProgressPage as ProgressPage } from "@/lib/observation-progress-pagination";
import { acApi, type ObservationItem, userDisplayName } from "@/lib/ac-api";

const EMPTY_PAGE: ProgressPage = { items: [], next: null };
const FIRST_PAGE: ObservationPagePosition = { cycleIndex: 0 };

function courseLabel(row: ObservationItem) {
  const course = typeof row.course === "string" ? row.course : row.course ?? row.section?.course;
  if (typeof course === "string") return course;
  return course?.code || course?.title || course?.name || "—";
}

export default function ObservationProgressPage({canSendReminders=false}:{canSendReminders?:boolean} = {}) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [q, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const { cycles, selectedCycle, selection } = useAcCycle();
  const cycleId = selectedCycle?.id;
  const [pageSize, setPageSize] = useState(20);
  const cycleIds = selection === "all" ? cycles.map(cycle => cycle.id) : cycleId ? [cycleId] : [];
  const cycleKey = JSON.stringify(cycleIds);
  const filterKey = JSON.stringify([cycleKey, status, q, pageSize]);
  const [navigation, setNavigation] = useState<{ key: string; positions: ObservationPagePosition[] }>({ key: "", positions: [FIRST_PAGE] });
  const positions = navigation.key === filterKey ? navigation.positions : [FIRST_PAGE];
  const position = positions.at(-1)!;
  const [attempt, setAttempt] = useState(0);
  const loader = useCallback(async () => {
    void attempt;
    const ids: string[] = JSON.parse(cycleKey);
    return loadObservationProgressPage(ids, position, pageSize, (id, cursor, limit) => acApi.getObservationsPage(id, { status, q, cursor, limit }));
  }, [cycleKey, position, pageSize, status, q, attempt]);
  const result = useApiResource(loader, EMPTY_PAGE);

  return (
    <div className="space-y-ah-24">
      <div className="grid min-h-[88px] max-w-[976px] grid-cols-1 gap-ah-16 md:grid-cols-2">
        <Select label="Status" name="status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-control-56">
          <option value="all">All</option><option value="in-progress">In progress</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option><option value="unmatched">Unmatched</option>
        </Select>
        <CycleSelector allowAll />
      </div>
      <Input type="search" label="Search by professor name" placeholder="Search observee or observer name…" maxLength={200}
        value={search} onChange={event => setSearch(event.target.value)} wrapperClassName="max-w-[480px]" />
      <ReminderControl cycleId={selection === "all" ? undefined : cycleId} canSend={canSendReminders} recipientFilter={{...(search.trim()?{q:search.trim()}:{}),...(status!=="all"?{observationStatus:status}:{})}} />
      {result.loading && <p role="status" className="text-muted">Loading observations…</p>}
      {result.error && <div className="space-y-ah-8"><p role="alert" className="text-danger">Observation progress is currently unavailable.</p><Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Retry</Button></div>}
      <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface">
        <table className="w-full min-w-[760px] table-fixed border-collapse">
          <thead><tr className="h-[80px] bg-canvas">
            {["Observee", "Observer", "Course", "Status", "Form"].map((heading) => <TableCell key={heading} variant="header" className="h-[80px]! w-1/5!">{heading}</TableCell>)}
          </tr></thead>
          <tbody>
            {result.data.items.map((row) => (
              <tr key={row.id} className="h-[81px] border-t border-border">
                <TableCell className="h-[80px]!">{userDisplayName(row.observee)}</TableCell>
                <TableCell className="h-[80px]!">{userDisplayName(row.observer)}</TableCell>
                <TableCell className="h-[80px]!">{courseLabel(row)}</TableCell>
                <TableCell className="h-[80px]!">{row.status ?? "—"}</TableCell>
                <TableCell className="h-[80px]!"><Link href={`/ac/observations/${row.id}`} className="inline-flex min-h-9 min-w-[110px] items-center justify-center px-ah-12 text-label text-sidebar">View</Link></TableCell>
              </tr>
            ))}
            {!result.loading && result.data.items.length === 0 && <tr><td colSpan={5} className="h-[80px] px-ah-12 text-body text-muted">
              {result.error ? "Observation progress is currently unavailable." : "No observations match these filters."}
            </td></tr>}
          </tbody>
        </table>
      </div>
      <nav aria-label="Observation table pages" className="flex flex-wrap items-end justify-between gap-ah-16">
        <Select label="Rows per page" value={pageSize} onChange={event => setPageSize(Number(event.target.value))} wrapperClassName="w-[160px]">
          {[20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
        </Select>
        <div className="flex items-center gap-ah-16">
          <Button variant="secondary" disabled={result.loading || positions.length === 1} onClick={() => setNavigation({ key: filterKey, positions: positions.slice(0, -1) })}>Previous</Button>
          <span role="status" className="text-label">Page {positions.length}</span>
          <Button variant="secondary" disabled={result.loading || !!result.error || !result.data.next}
            onClick={() => { if (result.data.next) setNavigation({ key: filterKey, positions: [...positions, result.data.next] }); }}>Next</Button>
        </div>
      </nav>
    </div>
  );
}
