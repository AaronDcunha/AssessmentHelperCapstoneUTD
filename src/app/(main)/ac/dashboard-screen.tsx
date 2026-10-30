"use client";

import { useCallback, useState } from "react";
import { CycleSelector, useAcCycle } from "@/components/ac/cycle-context";
import { AttentionTableRow } from "@/components/ac/attention-table-row";
import { useApiResource } from "@/components/ac/use-api-resource";
import { MetricCard } from "@/components/shared/metric-card";
import { TableCell } from "@/components/ui/table";
import { TextAction } from "@/components/ui/text-action";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { acApi, type AlertResource, type AttentionItem, type ReportsResponse, userDisplayName } from "@/lib/ac-api";
import { mergeAttention, attentionReviewHref } from "@/lib/ac-attention";
import { configurationError } from "@/lib/ac-configuration";

const EMPTY_REPORT: ReportsResponse = { cycleId: "", summary: { facultyDue: 0, overdue: 0, unmatched: 0, incomplete: 0 }, byHiringLevel: [] };
const EMPTY_ATTENTION: AttentionItem[] = [];
const EMPTY_ALERTS: AlertResource[] = [];

export default function AcDashboardPage() {
  const { selectedCycle } = useAcCycle();
  const cycleId = selectedCycle?.id;
  const [attentionAttempt, setAttentionAttempt] = useState(0);
  const [alertsAttempt, setAlertsAttempt] = useState(0);
  const report = useApiResource(useCallback(() => cycleId ? acApi.getReports(cycleId) : Promise.resolve(EMPTY_REPORT), [cycleId]), EMPTY_REPORT);
  const attention = useApiResource(useCallback(async () => {
    void attentionAttempt;
    try { return cycleId ? await acApi.getAttention(cycleId) : EMPTY_ATTENTION; }
    catch (error) { throw new Error(configurationError(error)); }
  }, [cycleId, attentionAttempt]), EMPTY_ATTENTION);
  const alerts = useApiResource(useCallback(async () => {
    void alertsAttempt;
    try { return cycleId ? await acApi.getCycleAlerts(cycleId) : EMPTY_ALERTS; }
    catch (error) { throw new Error(configurationError(error)); }
  }, [cycleId, alertsAttempt]), EMPTY_ALERTS);
  const rows = mergeAttention(attention.data, alerts.data);

  return (
    <div className="space-y-ah-48 pt-ah-16">
      <CycleSelector />
      <section aria-label="Evaluation cycle summary" className="grid grid-cols-1 gap-ah-16 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Faculty due" value={report.data.summary.facultyDue ?? "—"} className="w-full" />
        <MetricCard label="Overdue" value={report.data.summary.overdue ?? "—"} tone="danger" className="w-full" />
        <MetricCard label="Unmatched" value={report.data.summary.unmatched} className="w-full" />
        <MetricCard label="Incomplete" value={report.data.summary.incomplete} className="w-full" />
      </section>
      {!!report.data.summary.needsReview && <p className="text-caption text-muted">{report.data.summary.needsReview} faculty need eligibility review and are excluded from due/overdue totals.</p>}

      <Section title="Needs attention" variant="plain" contentClassName="space-y-ah-16" actions={<TextAction href="/ac/observations">View all</TextAction>}>
        {!cycleId && <p role="status" className="text-muted">Select an evaluation cycle to view items needing attention.</p>}
        {cycleId && <>
          {attention.loading && <p role="status" className="text-muted">Loading attention items…</p>}
          {alerts.loading && <p role="status" className="text-muted">Loading faculty alerts…</p>}
          {attention.error && <div className="space-y-ah-8"><p role="alert" className="text-danger">Attention items could not be loaded. {attention.error}</p><Button variant="secondary" onClick={() => setAttentionAttempt(n => n + 1)}>Retry attention items</Button></div>}
          {alerts.error && <div className="space-y-ah-8"><p role="alert" className="text-danger">Faculty alerts could not be loaded. {alerts.error}</p><Button variant="secondary" onClick={() => setAlertsAttempt(n => n + 1)}>Retry alerts</Button></div>}
        </>}
        <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface">
          <table className="w-full min-w-[760px] border-collapse">
            <thead><tr className="h-ah-40 bg-canvas">
              <TableCell variant="header" className="h-ah-40! w-[35%]! py-ah-8! pl-ah-24!">Faculty</TableCell>
              <TableCell variant="header" className="h-ah-40! w-[25%]! py-ah-8!">Issue</TableCell>
              <TableCell variant="header" className="h-ah-40! w-[24%]! py-ah-8!">Observation status</TableCell>
              <TableCell variant="header" className="h-ah-40! w-[16%]! py-ah-8!"><span className="sr-only">Action</span></TableCell>
            </tr></thead>
            <tbody>
              {rows.map((item) => (
                <AttentionTableRow key={item.rowKey} faculty={userDisplayName(item.faculty)}
                  issueStatus={item.issue === "overdue" || item.issue === "unmatched" || item.issue === "incomplete" || item.issue === "alert" ? item.issue : null}
                  observationStatus={item.observationStatus}
                  action={attentionReviewHref(item) ? { href: attentionReviewHref(item)!, ariaLabel: `Review ${userDisplayName(item.faculty)}'s ${item.issue === "alert" ? "alert" : "observation"}` } : null} />
              ))}
              {cycleId && !attention.loading && !alerts.loading && !attention.error && !alerts.error && rows.length === 0 && (
                <tr><td colSpan={4} className="h-[68px] px-ah-24 text-body text-muted">
                  No items need attention.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
