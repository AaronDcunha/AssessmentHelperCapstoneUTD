"use client";

import { useCallback } from "react";
import { AttentionTableRow } from "@/components/ac/attention-table-row";
import { useApiResource } from "@/components/ac/use-api-resource";
import { MetricCard } from "@/components/shared/metric-card";
import { TableCell } from "@/components/ui/table";
import { TextAction } from "@/components/ui/text-action";
import { acApi, CURRENT_CYCLE_ID, type AttentionItem, type ReportsResponse, userDisplayName } from "@/lib/ac-api";

const EMPTY_REPORT: ReportsResponse = { cycleId: CURRENT_CYCLE_ID, summary: { facultyDue: 0, overdue: 0, unmatched: 0, incomplete: 0 }, byHiringLevel: [] };
const EMPTY_ATTENTION: AttentionItem[] = [];

export default function AcDashboardPage() {
  const report = useApiResource(useCallback(() => acApi.getReports(CURRENT_CYCLE_ID), []), EMPTY_REPORT);
  const attention = useApiResource(useCallback(() => acApi.getAttention(CURRENT_CYCLE_ID), []), EMPTY_ATTENTION);

  return (
    <div className="space-y-ah-48 pt-ah-16">
      <section aria-label="Evaluation cycle summary" className="grid grid-cols-1 gap-ah-16 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Faculty due" value={report.data.summary.facultyDue} className="w-full" />
        <MetricCard label="Overdue" value={report.data.summary.overdue} tone="danger" className="w-full" />
        <MetricCard label="Unmatched" value={report.data.summary.unmatched} className="w-full" />
        <MetricCard label="Incomplete" value={report.data.summary.incomplete} className="w-full" />
      </section>

      <section aria-labelledby="needs-attention-heading" className="space-y-ah-16">
        <div className="flex min-h-9 items-center justify-between gap-ah-16">
          <h2 id="needs-attention-heading" className="text-section text-ink">Needs attention</h2>
          <TextAction href="/ac/observations">View all</TextAction>
        </div>
        <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface">
          <table className="w-full min-w-[760px] border-collapse">
            <thead><tr className="h-ah-40 bg-canvas">
              <TableCell variant="header" className="h-ah-40! w-[35%]! py-ah-8! pl-ah-24!">Faculty</TableCell>
              <TableCell variant="header" className="h-ah-40! w-[25%]! py-ah-8!">Issue</TableCell>
              <TableCell variant="header" className="h-ah-40! w-[24%]! py-ah-8!">Observation status</TableCell>
              <TableCell variant="header" className="h-ah-40! w-[16%]! py-ah-8!"><span className="sr-only">Action</span></TableCell>
            </tr></thead>
            <tbody>
              {attention.data.map((item) => (
                <AttentionTableRow key={item.id} faculty={userDisplayName(item.faculty)}
                  issueStatus={item.issue === "overdue" || item.issue === "unmatched" || item.issue === "incomplete" ? item.issue : null}
                  observationStatus={item.observationStatus}
                  action={item.observationId ? { href: `/ac/observations/${item.observationId}`, ariaLabel: `Review ${userDisplayName(item.faculty)}'s observation` } : null} />
              ))}
              {!attention.loading && attention.data.length === 0 && (
                <tr><td colSpan={4} className="h-[68px] px-ah-24 text-body text-muted">
                  {attention.error ? "Needs-attention data is currently unavailable." : "No items need attention."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
