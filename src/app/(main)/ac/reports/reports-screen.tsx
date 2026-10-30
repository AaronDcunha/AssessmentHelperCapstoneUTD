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
      <section aria-label="Key performance indicators" className="grid auto-rows-fr grid-cols-1 gap-ah-16 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.loading ? Array.from({ length: 7 }, (_, i) => <div key={i} className="min-h-[220px] animate-pulse rounded-ah-8 bg-neutral-bg" aria-label="Loading metric" />)
          : metrics.data.metrics.map(metric => {
            const needsReview = metric.key === "assessmentParticipationRate" ? metrics.data.counts?.baselineNeedsReview ?? 0 : 0;
            const description = [metric.unavailableReason, needsReview ? `Participation excludes ${needsReview} faculty whose evaluation requirements need review.` : null].filter(Boolean).join(" ");
            return <MetricCard key={metric.key} label={metric.label} value={metric.value === null ? "N/A" : `${metric.value}${metric.unit === "percent" ? "%" : ""}`}
              description={description || undefined} className="h-full min-h-[220px] w-full min-w-0" />;
          })}
      </section>
      {metrics.error && <p role="alert" className="text-body text-danger">{metrics.error}</p>}
      {metrics.data.reportingMode && <p className="text-caption text-muted">Figures update as evaluation records change.</p>}
      <Section title="Executive summary" contentClassName="space-y-ah-12 text-body text-ink">
        {report.data.byHiringLevel.length > 0 ? report.data.byHiringLevel.map((item) => (
          <div key={item.hiringLevelId}>
            <p>{item.name}: {item.due ?? "—"} due, {item.overdue ?? "—"} overdue evaluations, {item.outstanding} outstanding observations, {item.needsReview ?? 0} need eligibility review</p>
            {item.pendingStages && <p className="text-caption text-muted">{Object.entries(item.pendingStages).filter(([, count]) => count > 0).map(([stage, count]) => `${count} ${stage.replaceAll("-", " ")}${item.overdueStages?.[stage] ? ` (${item.overdueStages[stage]} past the observation deadline)` : ""}`).join(" · ")}</p>}
          </div>
        )) : <p className="text-muted">{report.error ? "Report summary is currently unavailable." : "No report summary is available."}</p>}
      </Section>
      {!!report.data.unmatchedFaculty?.length && <Section title="Unmatched faculty" contentClassName="space-y-ah-12 text-body text-ink">
        {report.data.unmatchedFaculty.map(item => <p key={item.signupId}>{item.professor.name}: {item.course}.{item.section} — {item.stage.replaceAll("-", " ")} · signed up {new Date(item.signupDate).toLocaleDateString()}</p>)}
      </Section>}
    </div>
  );
}
