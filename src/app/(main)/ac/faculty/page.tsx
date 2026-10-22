import { Select } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";

const facultyRows = Array.from({ length: 6 }, (_, index) => ({
  professor: `Professor ${index + 1}`,
  hiringLevel: "Rank",
  lastEvaluation: "Semester",
  status: index % 2 === 0 ? "Due" : "Overdue",
  signedUp: index % 2 === 0 ? "Yes" : "No",
}));

export default function FacultyDuePage() {
  return (
    <div className="space-y-ah-24">
      <div className="grid min-h-[88px] max-w-[976px] grid-cols-2 gap-ah-16">
        <Select label="Hiring level" name="hiringLevel" defaultValue="all" className="h-control-56">
          <option value="all">All</option>
        </Select>
        <Select label="Due / Overdue" name="evaluationStatus" defaultValue="all" className="h-control-56">
          <option value="all">All</option>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface">
        <table className="w-full min-w-[900px] table-fixed border-collapse">
          <thead>
            <tr className="h-[80px] bg-canvas">
              {["Professor", "Hiring level", "Last evaluation", "Status", "Signed up"].map((heading) => (
                <TableCell key={heading} variant="header" className="h-[80px]! w-1/5!">{heading}</TableCell>
              ))}
            </tr>
          </thead>
          <tbody>
            {facultyRows.map((row) => (
              <tr key={row.professor} className="h-[81px] border-t border-border">
                <TableCell className="h-[80px]! w-1/5!">{row.professor}</TableCell>
                <TableCell className="h-[80px]! w-1/5!">{row.hiringLevel}</TableCell>
                <TableCell className="h-[80px]! w-1/5!">{row.lastEvaluation}</TableCell>
                <TableCell className="h-[80px]! w-1/5!">{row.status}</TableCell>
                <TableCell className="h-[80px]! w-1/5!">{row.signedUp}</TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
