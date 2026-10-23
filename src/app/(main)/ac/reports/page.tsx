"use client";

import { useCallback } from "react";
import { useApiResource } from "@/components/ac/use-api-resource";
import { MetricCard } from "@/components/shared/metric-card";
import { Section } from "@/components/ui/section";
import { acApi, CURRENT_CYCLE_ID, type MetricsResponse, type ReportsResponse } from "@/lib/ac-api";

const EMPTY_METRICS: MetricsResponse = { cycleId: CURRENT_CYCLE_ID, available: false, metrics: [] };
const EMPTY_REPORT: ReportsResponse = { cycleId: CURRENT_CYCLE_ID, summary: { facultyDue: 0, overdue: 0, unmatched: 0, incomplete: 0 }, byHiringLevel: [] };
const cards = [
  { aliases: ["participation", "participationrate", "assessmentparticipationrate"], label: "Participation rate" },
  { aliases: ["observerutilization", "observerutilizationrate"], label: "Observer utilization" },
  { aliases: ["listsufficiency", "listsufficiencyrate"], label: "List sufficiency" },
  { aliases: ["incompleteobservations", "missingobservationcount"], label: "Incomplete observations" },
] as const;

export default function ReportsPage() {
  const metrics = useApiResource(useCallback(() => acApi.getMetrics(CURRENT_CYCLE_ID), []), EMPTY_METRICS);
  const report = useApiResource(useCallback(() => acApi.getReports(CURRENT_CYCLE_ID), []), EMPTY_REPORT);
  const normalize = (value: string) => value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  const valueFor = (aliases: readonly string[]) => {
    const metric = metrics.data.metrics.find((item) => aliases.includes(normalize(item.key)) || aliases.includes(normalize(item.label)));
    if (metric?.value == null) return 0;
    return metric.unit === "%" || metric.unit === "percent" ? `${metric.value}%` : metric.value;
  };

  return (
    <div className="space-y-ah-24">
      <section aria-label="Key performance indicators" className="grid grid-cols-1 gap-ah-16 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <MetricCard key={card.label} label={card.label} value={valueFor(card.aliases)} className="w-full" />)}
      </section>
      <Section title="Executive summary" contentClassName="space-y-ah-12 text-body text-ink">
        {report.data.byHiringLevel.length > 0 ? report.data.byHiringLevel.map((item) => (
          <p key={item.hiringLevelId}>{item.name}: {item.due} due, {item.outstanding} outstanding</p>
        )) : <p className="text-muted">{report.error ? "Report summary is currently unavailable." : "No report summary is available."}</p>}
      </Section>
    </div>
  );
}
