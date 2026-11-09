"use client";

import { ReminderControl } from "@/components/ac/reminder-control";
import { useCallback, useEffect, useState } from "react";
import { CycleSelector, useAcCycle } from "@/components/ac/cycle-context";
import { useApiResource } from "@/components/ac/use-api-resource";
import { Input, Select } from "@/components/ui/form-fields";
import { Table, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { acApi, type FacultyStatusItem, type HiringLevel, type Page, userDisplayName } from "@/lib/ac-api";

const EMPTY_PAGE: Page<FacultyStatusItem> = { items: [], pageInfo: { hasMore: false, nextCursor: null } };
const EMPTY_LEVELS: HiringLevel[] = [];

export default function FacultyDuePage({canSendReminders=false}:{canSendReminders?:boolean} = {}) {
  const cycleId = useAcCycle().selectedCycle?.id;
  const [hiringLevelId, setHiringLevelId] = useState("all");
  const [evaluationStatus, setEvaluationStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [q, setQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const [pageSize, setPageSize] = useState(20);
  const filterKey = JSON.stringify([cycleId, hiringLevelId, evaluationStatus, q, pageSize]);
  const [navigation, setNavigation] = useState<{ key: string; cursors: (string | undefined)[] }>({ key: "", cursors: [undefined] });
  const cursors = navigation.key === filterKey ? navigation.cursors : [undefined];
  const cursor = cursors.at(-1);
  const [attempt, setAttempt] = useState(0);
  const loader = useCallback(() => {
    void attempt;
    return cycleId ? acApi.getFacultyStatusPage(cycleId, { hiringLevelId, evaluationStatus, q, cursor, limit: pageSize }) : Promise.resolve(EMPTY_PAGE);
  }, [cycleId, hiringLevelId, evaluationStatus, q, cursor, pageSize, attempt]);
  const result = useApiResource(loader, EMPTY_PAGE);
  const levels = useApiResource(useCallback(() => acApi.getHiringLevels(), []), EMPTY_LEVELS);

  return (
    <div className="space-y-ah-24">
      <CycleSelector />
      <Input type="search" label="Search by professor name" placeholder="Search professor name…" maxLength={200}
        value={search} onChange={event => setSearch(event.target.value)} wrapperClassName="max-w-[480px]" />
      <div className="grid min-h-[88px] max-w-[976px] grid-cols-1 gap-ah-16 md:grid-cols-2">
        <Select label="Hiring level" name="hiringLevel" value={hiringLevelId} onChange={(event) => setHiringLevelId(event.target.value)} className="h-control-56">
          <option value="all">All</option>{levels.data.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
        </Select>
        <Select label="Due / Overdue" name="evaluationStatus" value={evaluationStatus} onChange={(event) => setEvaluationStatus(event.target.value)} className="h-control-56">
          <option value="all">All</option><option value="due">Due</option><option value="overdue">Overdue</option>
          <option value="not_due">Not due</option><option value="needs-review">Needs review</option>
        </Select>
      </div>

      <ReminderControl cycleId={cycleId} canSend={canSendReminders} recipientFilter={{...(search.trim()?{q:search.trim()}:{}),...(hiringLevelId!=="all"?{hiringLevelId}:{}),...(evaluationStatus!=="all"?{evaluationStatus}:{})}} />
      {result.loading && <p role="status" className="text-muted">Loading faculty…</p>}
      {result.error && <div className="space-y-ah-8"><p role="alert" className="text-danger">Faculty status data is currently unavailable.</p><Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Retry</Button></div>}
      <Table className="w-full min-w-[760px] table-fixed border-collapse"
        regionProps={{ className: "overflow-x-auto", tabIndex: 0, role: "region", "aria-label": "Faculty due and overdue", "aria-busy": result.loading }}
        pagination={{
          page: cursors.length,
          pageSize,
          pageSizes: [20, 50, 100],
          rowsShown: result.loading || result.error ? null : result.data.items.length,
          itemLabel: { singular: "faculty member", plural: "faculty members" },
          hasNextPage: result.data.pageInfo.hasMore && Boolean(result.data.pageInfo.nextCursor),
          disabled: !cycleId || result.loading || !!result.error,
          onPageSizeChange: setPageSize,
          onPageChange: page => {
            const next = result.data.pageInfo.nextCursor;
            if (page < cursors.length) setNavigation({ key: filterKey, cursors: cursors.slice(0, -1) });
            else if (next) setNavigation({ key: filterKey, cursors: [...cursors, next] });
          },
        }}>
          <thead><tr className="h-[80px] bg-canvas">
            {["Professor", "Hiring level", "Last evaluation", "Status", "Signed up"].map((heading) => <TableCell key={heading} variant="header" className="h-[80px]! w-1/5!">{heading}</TableCell>)}
          </tr></thead>
          <tbody>
            {result.data.items.map((row) => (
              <tr key={row.professor.id} className="h-[81px] border-t border-border">
                <TableCell className="h-[80px]!">{userDisplayName(row.professor)}</TableCell>
                <TableCell className="h-[80px]!">{typeof row.hiringLevel === "string" ? row.hiringLevel : row.hiringLevel.name}</TableCell>
                <TableCell className="h-[80px]!">{row.lastEvaluation?.semester?.name?.trim() || "—"}</TableCell>
                <TableCell className="h-[80px]!">{{ due: "Due", overdue: "Overdue", not_due: "Not due", "needs-review": "Needs review" }[row.evaluationStatus] || "—"}</TableCell>
                <TableCell className="h-[80px]!">{row.signupId ? "Yes" : "No"}</TableCell>
              </tr>
            ))}
            {!result.loading && result.data.items.length === 0 && <tr><td colSpan={5} className="h-[80px] px-ah-12 text-body text-muted">
              {result.error ? "Faculty status data is currently unavailable." : "No faculty match these filters."}
            </td></tr>}
          </tbody>
      </Table>
    </div>
  );
}
