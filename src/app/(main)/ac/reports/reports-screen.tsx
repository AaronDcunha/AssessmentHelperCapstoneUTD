"use client";

import { useCallback } from "react";
import { CycleSelector, useAcCycle } from "@/components/ac/cycle-context";
import { useApiResource } from "@/components/ac/use-api-resource";
import { MetricCard } from "@/components/shared/metric-card";
import { Section } from "@/components/ui/section";
import { acApi, type MetricsResponse, type ReportsResponse } from "@/lib/ac-api";

const EMPTY_METRICS: MetricsResponse = { cycleId: "", available: false, metrics: [] };
const EMPTY_REPORT: ReportsResponse = { cycleId: "", summary: { facultyDue: 0, overdue: 0, unmatched: 0, incomplete: 0 }, byHiringLevel: [] };
export default function ReportsPage() {
  const cycleId = useAcCycle().selectedCycle?.id;
  const metrics = useApiResource(useCallback(() => cycleId ? acApi.getMetrics(cycleId) : Promise.resolve(EMPTY_METRICS), [cycleId]), EMPTY_METRICS);
  const report = useApiResource(useCallback(() => cycleId ? acApi.getReports(cycleId) : Promise.resolve(EMPTY_REPORT), [cycleId]), EMPTY_REPORT);
  return (
    <div className="space-y-ah-24">
      <CycleSelector />
      <section aria-label="Key performance indicators" className="grid grid-cols-1 gap-ah-16 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.loading ? Array.from({ length: 7 }, (_, i) => <div key={i} className="h-[148px] animate-pulse rounded-ah-8 bg-neutral-bg" aria-label="Loading metric" />)
          : metrics.data.metrics.map(metric => <div key={metric.key}>
            <MetricCard label={metric.label} value={metric.value === null ? "N/A" : `${metric.value}${metric.unit === "percent" ? "%" : ""}`} className="w-full" />
            {metric.unavailableReason && <p className="mt-ah-8 text-caption text-muted">{metric.unavailableReason}</p>}
          </div>)}
      </section>
      {metrics.error && <p role="alert" className="text-body text-danger">{metrics.error}</p>}
      {metrics.data.reportingMode && <p className="text-caption text-muted">Live calculations using current records and rank. Historical eligibility and schedule snapshots are not stored.
        {!!metrics.data.counts?.baselineNeedsReview && ` ${metrics.data.counts.baselineNeedsReview} faculty need eligibility review and are excluded from the due denominator.`}</p>}
      <Section title="Executive summary" contentClassName="space-y-ah-12 text-body text-ink">
        {report.data.byHiringLevel.length > 0 ? report.data.byHiringLevel.map((item) => (
          <div key={item.hiringLevelId}>
            <p>{item.name}: {item.due ?? "—"} due, {item.outstanding} outstanding{!!item.needsReview && `, ${item.needsReview} need eligibility review`}</p>
            {item.pendingStages && <p className="text-caption text-muted">{Object.entries(item.pendingStages).filter(([, count]) => count > 0).map(([stage, count]) => `${count} ${stage.replaceAll("-", " ")}`).join(" · ")}</p>}
          </div>
        )) : <p className="text-muted">{report.error ? "Report summary is currently unavailable." : "No report summary is available."}</p>}
      </Section>
      {!!report.data.unmatchedFaculty?.length && <Section title="Unmatched faculty" contentClassName="space-y-ah-12 text-body text-ink">
        {report.data.unmatchedFaculty.map(item => <p key={item.signupId}>{item.professor.name}: {item.course}.{item.section} — {item.stage.replaceAll("-", " ")} · signed up {new Date(item.signupDate).toLocaleDateString()}</p>)}
      </Section>}
    </div>
  );
}
