import { AttentionTableRow } from "@/components/ac/attention-table-row";
import { MetricCard } from "@/components/shared/metric-card";
import { TableCell } from "@/components/ui/table";
import { TextAction } from "@/components/ui/text-action";

const attentionItems = [
  { faculty: "Sarah Mitchell", issueStatus: "overdue", observationStatus: "Requests pending" },
  { faculty: "James Lee", issueStatus: "unmatched", observationStatus: "Missing observer" },
  { faculty: "Priya Raman", issueStatus: "incomplete", observationStatus: "Form incomplete" },
  { faculty: "Daniel Torres", issueStatus: "incomplete", observationStatus: "Awaiting form" },
] as const;

export default function AcDashboardPage() {
  return (
    <div className="space-y-ah-48 pt-ah-16">
      <section aria-label="Evaluation cycle summary" className="grid grid-cols-4 gap-ah-16">
        <MetricCard label="Faculty due" value={18} className="w-full" />
        <MetricCard label="Overdue" value={4} tone="danger" className="w-full" />
        <MetricCard label="Unmatched" value={3} className="w-full" />
        <MetricCard label="Incomplete" value={5} className="w-full" />
      </section>

      <section aria-labelledby="needs-attention-heading" className="space-y-ah-16">
        <div className="flex min-h-9 items-center justify-between gap-ah-16">
          <h2 id="needs-attention-heading" className="text-section text-ink">Needs attention</h2>
          <TextAction href="/ac/observations">View all</TextAction>
        </div>
        <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="h-ah-40 bg-canvas">
                <TableCell variant="header" className="h-ah-40! w-[384px]! py-ah-8! pl-ah-24! pr-ah-0!">Faculty</TableCell>
                <TableCell variant="header" className="h-ah-40! w-[288px]! px-ah-0! py-ah-8!">Issue</TableCell>
                <TableCell variant="header" className="h-ah-40! w-[210px]! px-ah-0! py-ah-8!">Observation status</TableCell>
                <TableCell variant="header" className="h-ah-40! w-[214px]! py-ah-8! pl-ah-0! pr-ah-24!">
                  <span className="sr-only">Action</span>
                </TableCell>
              </tr>
            </thead>
            <tbody>
              {attentionItems.map((item) => (
                <AttentionTableRow key={item.faculty} {...item}
                  action={{ href: "/ac/observations", ariaLabel: `Review ${item.faculty}'s observation` }} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
