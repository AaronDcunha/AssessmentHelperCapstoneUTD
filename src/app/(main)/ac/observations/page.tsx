import { Select } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";

const observationRows = Array.from({ length: 6 }, (_, index) => ({
  observee: `Professor ${index + 1}`,
  observer: "Professor",
  course: "Course",
  status: "In progress",
}));

export default function ObservationProgressPage() {
  return (
    <div className="space-y-ah-24">
      <div className="grid min-h-[88px] max-w-[976px] grid-cols-2 gap-ah-16">
        <Select label="Status" name="status" defaultValue="all" className="h-control-56">
          <option value="all">All</option>
        </Select>
        <Select label="Semester" name="semester" defaultValue="all" className="h-control-56">
          <option value="all">All</option>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface">
        <table className="w-full min-w-[900px] table-fixed border-collapse">
          <thead>
            <tr className="h-[80px] bg-canvas">
              {["Observee", "Observer", "Course", "Status", "Form"].map((heading) => (
                <TableCell key={heading} variant="header" className="h-[80px]! w-1/5!">{heading}</TableCell>
              ))}
            </tr>
          </thead>
          <tbody>
            {observationRows.map((row) => (
              <tr key={row.observee} className="h-[81px] border-t border-border">
                <TableCell className="h-[80px]! w-1/5!">{row.observee}</TableCell>
                <TableCell className="h-[80px]! w-1/5!">{row.observer}</TableCell>
                <TableCell className="h-[80px]! w-1/5!">{row.course}</TableCell>
                <TableCell className="h-[80px]! w-1/5!">{row.status}</TableCell>
                <TableCell className="h-[80px]! w-1/5!">
                  <span className="inline-flex min-h-9 min-w-[110px] items-center justify-center px-ah-12 text-label text-sidebar">View</span>
                </TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
