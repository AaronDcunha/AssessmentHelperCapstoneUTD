import { MetricCard } from "@/components/shared/metric-card";

export default function ReportsPage() {
  return (
    <div className="space-y-ah-24">
      <section aria-label="Key performance indicators" className="grid grid-cols-4 gap-ah-16">
        <MetricCard label="Participation rate" value="—" className="w-full" />
        <MetricCard label="Observer utilization" value="—" className="w-full" />
        <MetricCard label="List sufficiency" value="—" className="w-full" />
        <MetricCard label="Incomplete observations" value="—" className="w-full" />
      </section>

      <section aria-labelledby="executive-summary-heading" className="space-y-ah-16">
        <h2 id="executive-summary-heading" className="text-section text-ink">Executive summary</h2>
        <div className="space-y-ah-8 rounded-ah-8 border border-border bg-surface p-ah-24 text-body text-ink">
          <p>Faculty due by hiring level</p>
          <p>Outstanding observations</p>
          <p>Unmatched faculty</p>
        </div>
      </section>
    </div>
  );
}
