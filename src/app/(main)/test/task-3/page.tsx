import type { Metadata } from "next";
import { MetricCard, type MetricCardProps } from "@/components/shared/metric-card";
import { StatusBadge, type StatusBadgeStatus } from "@/components/shared/status-badge";
import { Section } from "@/components/ui/section";
import { TableCell } from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Task 3 Preview | Assessment Helper",
};

const faculty: { name: string; status: StatusBadgeStatus; observation: string }[] = [
  { name: "Alex Morgan", status: "overdue", observation: "Pending" },
  { name: "Jordan Lee", status: "unmatched", observation: "Awaiting observer" },
  { name: "Taylor Davis", status: "incomplete", observation: "Awaiting assessment" },
];

const metrics: (MetricCardProps & { id: string })[] = [
  { id: "default", label: "Faculty due", value: 24 },
  { id: "danger", label: "Overdue evaluations", value: 7, tone: "danger" },
  { id: "zero", label: "Missing observations", value: 0 },
  { id: "formatted", label: "Sample percentage", value: "83%" },
  { id: "missing", label: "Value not supplied" },
  { id: "null", label: "No data returned", value: null },
  { id: "loading", label: "Loading metric", value: 24, loading: true },
  { id: "error", label: "Metric unavailable", value: 24, error: "Could not load metric." },
];

export default function Task3PreviewPage() {
  return (
    <div className="space-y-ah-24">
      <Section title="Table cells" description="Header and body variants with sample data, a row heading, and a spanning cell.">
        <div className="overflow-x-auto" role="region" aria-label="Sample faculty table" tabIndex={0}>
          <table className="w-full border-collapse">
            <caption className="pb-ah-12 text-left text-caption text-muted">Sample faculty observations</caption>
            <thead>
              <tr>
                <TableCell variant="header" id="faculty-column">Faculty</TableCell>
                <TableCell variant="header" id="issue-column">Issue</TableCell>
                <TableCell variant="header" id="observation-column">Observation</TableCell>
              </tr>
            </thead>
            <tbody>
              {faculty.map((person) => (
                <tr key={person.name}>
                  <TableCell headers="faculty-column">{person.name}</TableCell>
                  <TableCell headers="issue-column"><StatusBadge status={person.status} /></TableCell>
                  <TableCell headers="observation-column">{person.observation}</TableCell>
                </tr>
              ))}
              <tr>
                <TableCell variant="header" scope="row">Sample total</TableCell>
                <TableCell colSpan={2}>{faculty.length} sample records</TableCell>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Status badges" description="Danger, warning, and neutral variants retain visible text labels.">
        <div className="flex flex-wrap gap-ah-16">
          <StatusBadge status="overdue" />
          <StatusBadge status="unmatched" />
          <StatusBadge status="incomplete" />
        </div>
      </Section>

      <Section title="Metric cards" description="Sample values only. Loading and error states hide stale values; zero remains a valid value.">
        <div className="flex flex-wrap gap-ah-24">
          {metrics.map(({ id, ...metric }) => <MetricCard key={id} id={`metric-${id}`} {...metric} />)}
        </div>
      </Section>
    </div>
  );
}
