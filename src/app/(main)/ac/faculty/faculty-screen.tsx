"use client";

import { ReminderControl } from "@/components/ac/reminder-control";
import { useCallback, useState } from "react";
import { CycleSelector, useAcCycle } from "@/components/ac/cycle-context";
import { useApiResource } from "@/components/ac/use-api-resource";
import { Select } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";
import { acApi, type FacultyStatusItem, type HiringLevel, userDisplayName } from "@/lib/ac-api";

const EMPTY_ROWS: FacultyStatusItem[] = [];
const EMPTY_LEVELS: HiringLevel[] = [];

export default function FacultyDuePage({canSendReminders=false}:{canSendReminders?:boolean} = {}) {
  const cycleId = useAcCycle().selectedCycle?.id;
  const [hiringLevelId, setHiringLevelId] = useState("all");
  const [evaluationStatus, setEvaluationStatus] = useState("all");
  const loader = useCallback(() => cycleId ? acApi.getFacultyStatus(cycleId, { hiringLevelId, evaluationStatus }) : Promise.resolve(EMPTY_ROWS), [cycleId, hiringLevelId, evaluationStatus]);
  const result = useApiResource(loader, EMPTY_ROWS);
  const levels = useApiResource(useCallback(() => acApi.getHiringLevels(), []), EMPTY_LEVELS);

  return (
    <div className="space-y-ah-24">
      <CycleSelector />
      <div className="grid min-h-[88px] max-w-[976px] grid-cols-1 gap-ah-16 md:grid-cols-2">
        <Select label="Hiring level" name="hiringLevel" value={hiringLevelId} onChange={(event) => setHiringLevelId(event.target.value)} className="h-control-56">
          <option value="all">All</option>{levels.data.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
        </Select>
        <Select label="Due / Overdue" name="evaluationStatus" value={evaluationStatus} onChange={(event) => setEvaluationStatus(event.target.value)} className="h-control-56">
          <option value="all">All</option><option value="due">Due</option><option value="overdue">Overdue</option>
          <option value="not_due">Not due</option><option value="needs-review">Needs review</option>
        </Select>
      </div>

      <ReminderControl cycleId={cycleId} canSend={canSendReminders} recipientFilter={{...(hiringLevelId!=="all"?{hiringLevelId}:{}),...(evaluationStatus!=="all"?{evaluationStatus}:{})}} />
      <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface">
        <table className="w-full min-w-[760px] table-fixed border-collapse">
          <thead><tr className="h-[80px] bg-canvas">
            {["Professor", "Hiring level", "Last evaluation", "Status", "Signed up"].map((heading) => <TableCell key={heading} variant="header" className="h-[80px]! w-1/5!">{heading}</TableCell>)}
          </tr></thead>
          <tbody>
            {result.data.map((row) => (
              <tr key={row.professor.id} className="h-[81px] border-t border-border">
                <TableCell className="h-[80px]!">{userDisplayName(row.professor)}</TableCell>
                <TableCell className="h-[80px]!">{typeof row.hiringLevel === "string" ? row.hiringLevel : row.hiringLevel.name}</TableCell>
                <TableCell className="h-[80px]!">{row.lastEvaluation?.semester?.name?.trim() || "—"}</TableCell>
                <TableCell className="h-[80px]!">{{ due: "Due", overdue: "Overdue", not_due: "Not due", "needs-review": "Needs review" }[row.evaluationStatus] || "—"}</TableCell>
                <TableCell className="h-[80px]!">{row.signupId ? "Yes" : "No"}</TableCell>
              </tr>
            ))}
            {!result.loading && result.data.length === 0 && <tr><td colSpan={5} className="h-[80px] px-ah-12 text-body text-muted">
              {result.error ? "Faculty status data is currently unavailable." : "No faculty match these filters."}
            </td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
