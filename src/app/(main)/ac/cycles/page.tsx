import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";

const cycles = ["Open", "Closed", "Closed", "Closed"] as const;

export default function EvaluationCyclesPage() {
  return (
    <div className="space-y-ah-24">
      <section className="space-y-ah-16" aria-labelledby="cycles-heading">
        <h2 id="cycles-heading" className="text-section text-ink">Current and previous cycles</h2>
        <Button className="w-[260px]">Create Cycle</Button>
      </section>

      <div className="rounded-ah-8 border border-border bg-surface">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[210px]" /><col className="w-[210px]" /><col className="w-[230px]" />
            <col className="w-[230px]" /><col className="w-[150px]" /><col className="w-[66px]" />
          </colgroup>
          <thead>
            <tr className="h-[81px] bg-canvas">
              {[
                "Cycle", "Signup deadline", "Observation deadline", "Feedback deadline", "Status", "",
              ].map((heading, index) => (
                <TableCell key={`${heading}-${index}`} variant="header" className="h-[80px]!">{heading}</TableCell>
              ))}
            </tr>
          </thead>
          <tbody>
            {cycles.map((status, index) => (
              <tr key={index} className="h-[81px] border-t border-border">
                <TableCell className="h-[80px]!">Fall 20XX</TableCell>
                <TableCell className="h-[80px]!">Date</TableCell>
                <TableCell className="h-[80px]!">Date</TableCell>
                <TableCell className="h-[80px]!">Date</TableCell>
                <TableCell className="h-[80px]!">{status}</TableCell>
                <TableCell className="relative h-[80px]! px-ah-0! text-center">
                  <details className="relative" open={index === 0}>
                    <summary className="flex h-11 cursor-pointer list-none items-center justify-center text-label text-sidebar">…</summary>
                    <div className="absolute right-ah-12 top-[52px] z-10 flex h-[52px] w-[180px] items-center rounded-ah-8 border border-border bg-surface p-ah-4">
                      <button type="button" className="h-11 w-full rounded-ah-8 text-label text-sidebar">Edit Cycle</button>
                    </div>
                  </details>
                </TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
