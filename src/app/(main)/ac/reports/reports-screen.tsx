"use client";

import { useCallback, useState } from "react";
import { CycleSelector, useAcCycle } from "@/components/ac/cycle-context";
import { useApiResource } from "@/components/ac/use-api-resource";
import { Section } from "@/components/ui/section";
import { Table } from "@/components/ui/table";
import { acApi, userDisplayName, type MetricsResponse, type ReportsResponse } from "@/lib/ac-api";

const EMPTY_METRICS: MetricsResponse = { cycleId: "", available: false, metrics: [] };
const EMPTY_REPORT: ReportsResponse = { cycleId: "", summary: { facultyDue: 0, overdue: 0, unmatched: 0, incomplete: 0 }, byHiringLevel: [] };
const KPI_DESCRIPTIONS = {
  assessmentParticipationRate: "Cycle signups as a share of active faculty due for evaluation.",
  overdueEvaluationCount: "Active faculty with a past-due evaluation.",
  observerUtilizationRate: "Unique assigned observers divided by faculty signups.",
  listSufficiencyRate: "Recommended observers per signup.",
  evaluationEligibilityAccuracy: "Share of checked recommendations that meet eligibility rules.",
  surveyCompletionRate: "Share of signups with a completed evaluation and survey.",
  missingObservationCount: "Scheduled observations reported as missed.",
} as const;
const STAGE_LABELS: Record<string, string> = {
  "awaiting-generation": "Awaiting recommendations",
  "awaiting-release": "Awaiting recommendation release",
  "awaiting-selection": "Awaiting observer selection",
  "awaiting-observer": "Awaiting an observer",
  "awaiting-appointment": "Awaiting scheduling",
  upcoming: "Upcoming appointment",
  "awaiting-observer-submission": "Awaiting observer submission",
  "awaiting-observee-acknowledgement": "Awaiting observee acknowledgement",
  "awaiting-finalization": "Awaiting finalization",
  "reported-not-occurred": "Reported as missed",
};
const PAGE_SIZES = [5, 10, 25] as const;
const tableClass = "w-full border-collapse text-left [&_th]:px-ah-16 [&_td]:px-ah-16 [&_th]:py-ah-12 [&_td]:py-ah-12 [&_th]:align-top [&_td]:align-top [&_thead]:bg-neutral-bg [&_thead]:text-label [&_thead]:text-muted [&_tbody_tr]:border-t [&_tbody_tr]:border-border";
const rowHeadingClass = "text-label text-ink";
const numberClass = "text-right tabular-nums";
const tableRegionClass = "overflow-x-auto focus-visible:outline-offset-[-3px]";
const signupDateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function stageLabel(stage: string) {
  return STAGE_LABELS[stage] ?? stage.replaceAll("-", " ");
}

function CycleKpis({ data, loading, error }: ReturnType<typeof useApiResource<MetricsResponse>>) {
  const orderedMetrics = Object.entries(KPI_DESCRIPTIONS).flatMap(([key, description]) => {
    const metric = data.metrics.find(item => item.key === key);
    return metric ? [{ ...metric, description }] : [];
  });
  return (
    <Section variant="plain" title="Cycle KPIs" aria-busy={loading}>
      {loading ? <p role="status" className="text-body text-muted">Loading key performance indicators…</p>
        : error ? <p role="alert" className="text-body text-danger">{error}</p>
          : orderedMetrics.length === 0 ? <p className="text-body text-muted">No metrics are available for this cycle.</p>
            : <dl className="grid border-t border-border sm:grid-cols-2">
              {orderedMetrics.map(metric => (
                <div key={metric.key} className="min-w-0 space-y-ah-4 border-b border-border py-ah-12 sm:odd:pr-ah-16 sm:even:pl-ah-16 sm:last:odd:col-span-2">
                  <dt className="text-label text-ink">{metric.label}</dt>
                  <dd className="text-section text-sidebar tabular-nums">
                    {metric.value === null ? <abbr title="Not available">N/A</abbr> : `${metric.value}${metric.unit === "percent" ? "%" : ""}`}
                  </dd>
                  <dd className="text-label text-muted">{metric.description}</dd>
                  {metric.unavailableReason && <dd className="text-caption text-muted">{metric.unavailableReason}</dd>}
                </div>
              ))}
            </dl>}
    </Section>
  );
}

function ExecutiveSummary({ rows }: { rows: ReportsResponse["byHiringLevel"] }) {
  return (
    <Section variant="plain" title="Executive summary" description="Evaluation and observation status by hiring level.">
      {rows.length === 0 ? <p className="text-body text-muted">No hiring-level summary is available for this cycle.</p> :
        <div className="overflow-hidden rounded-ah-8 border border-border bg-surface">
          <Table className={`${tableClass} min-w-[760px]`} regionProps={{ className: tableRegionClass, tabIndex: 0, role: "region", "aria-label": "Executive summary table" }}>
            <caption className="sr-only">Evaluation and observation counts by hiring level</caption>
            <thead><tr>
              <th scope="col">Hiring level</th>
              <th scope="col" className={numberClass}>Due</th>
              <th scope="col" className={numberClass}>Overdue</th>
              <th scope="col" className={numberClass}>Unfinished observations</th>
              <th scope="col" className={numberClass}>Needs review</th>
              <th scope="col">Pending stages</th>
            </tr></thead>
            <tbody>{rows.map(item => {
              const stages = Object.entries(item.pendingStages ?? {}).filter(([, count]) => count > 0);
              return <tr key={item.hiringLevelId}>
                <th scope="row" className={rowHeadingClass}>{item.name}</th>
                <td className={numberClass}>{item.due ?? "—"}</td>
                <td className={numberClass}>{item.overdue ?? "—"}</td>
                <td className={numberClass}>{item.outstanding}</td>
                <td className={numberClass}>{item.needsReview ?? "—"}</td>
                <td>{stages.length ? <ul className="space-y-ah-4 text-label">{stages.map(([stage, count]) => {
                  const overdue = item.overdueStages?.[stage];
                  return <li key={stage}>{stageLabel(stage)}: {count}{overdue ? ` (${overdue} past the observation deadline)` : ""}</li>;
                })}</ul> : <span className="text-muted">—</span>}</td>
              </tr>;
            })}</tbody>
          </Table>
        </div>}
    </Section>
  );
}

function UnmatchedFaculty({ rows }: { rows: NonNullable<ReportsResponse["unmatchedFaculty"]> }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / pageSize)));
  const start = (currentPage - 1) * pageSize;
  const visibleRows = rows.slice(start, start + pageSize);

  return (
    <Section variant="plain" title="Unmatched faculty" description="Faculty who signed up and are still waiting for an observer.">
      {rows.length === 0 ? <p className="text-body text-muted">No unmatched faculty for this cycle.</p> :
        <Table className={`${tableClass} min-w-[640px]`} regionProps={{ className: tableRegionClass, tabIndex: 0, role: "region", "aria-label": "Unmatched faculty table" }}
          pagination={{
            page: currentPage, pageSize, pageSizes: PAGE_SIZES, rowsShown: visibleRows.length, totalRows: rows.length,
            itemLabel: { singular: "faculty member", plural: "faculty members" },
            onPageChange: setPage,
            onPageSizeChange: size => { setPageSize(size); setPage(1); },
          }}>
          <caption className="sr-only">Faculty signups without a confirmed observer</caption>
          <thead><tr>
            <th scope="col">Faculty</th>
            <th scope="col">Course and section</th>
            <th scope="col">Current stage</th>
            <th scope="col">Signed up</th>
          </tr></thead>
          <tbody>{visibleRows.map(item => (
            <tr key={item.signupId}>
              <th scope="row" className={rowHeadingClass}>{userDisplayName(item.professor)}</th>
              <td>{[item.course, item.section].filter(Boolean).join(".") || "—"}</td>
              <td>{stageLabel(item.stage)}</td>
              <td className="whitespace-nowrap"><time dateTime={item.signupDate}>{signupDateFormat.format(new Date(item.signupDate))}</time></td>
            </tr>
          ))}</tbody>
        </Table>}
    </Section>
  );
}

export default function ReportsPage() {
  const cycleId = useAcCycle().selectedCycle?.id;
  const metrics = useApiResource(useCallback(() => cycleId ? acApi.getMetrics(cycleId) : Promise.resolve(EMPTY_METRICS), [cycleId]), EMPTY_METRICS);
  const report = useApiResource(useCallback(() => cycleId ? acApi.getReports(cycleId) : Promise.resolve(EMPTY_REPORT), [cycleId]), EMPTY_REPORT);

  return (
    <div className="min-w-0 space-y-ah-24">
      <CycleSelector />
      {cycleId && <>
        <CycleKpis {...metrics} />
        {report.loading ? <p role="status" className="text-body text-muted">Loading cycle reports…</p>
          : report.error ? <p role="alert" className="text-body text-danger">Cycle reports are currently unavailable.</p>
            : <>
              <ExecutiveSummary rows={report.data.byHiringLevel} />
              <UnmatchedFaculty key={cycleId} rows={report.data.unmatchedFaculty ?? []} />
            </>}
      </>}
    </div>
  );
}
