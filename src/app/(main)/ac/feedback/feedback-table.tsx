"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/form-fields";
import { Table, TableCell } from "@/components/ui/table";

type FeedbackTableProps = {
  semesters: { id: string; name: string }[];
  semesterId: string;
  page: number;
  pageSize: number;
  pageSizes: number[];
  total: number;
  rowsShown: number;
  children: ReactNode;
};

export function FeedbackTable({ semesters, semesterId, page, pageSize, pageSizes, total, rowsShown, children }: FeedbackTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function load(id: string, nextPage: number, size: number) {
    const params = new URLSearchParams({ semester: id, page: String(nextPage), size: String(size) });
    startTransition(() => router.push("/ac/feedback?" + params, { scroll: false }));
  }

  return <div className="space-y-ah-24">
    <Select label="Semester" wrapperClassName="max-w-[480px]" value={semesterId} disabled={pending || semesters.length === 0}
      onChange={event => load(event.target.value, 1, pageSize)}>
      <option value="" disabled>Select a semester</option>
      {semesters.map(semester => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
    </Select>
    {pending && <p role="status" className="text-muted">Loading feedback…</p>}
    {!semesterId ? <p role="status" className="text-muted">{semesters.length ? "Select a semester to view feedback." : "No semesters are configured."}</p> :
      <Table className="w-full min-w-[680px] table-fixed border-collapse"
        regionProps={{ className: "overflow-x-auto", tabIndex: 0, role: "region", "aria-label": "Semester feedback", "aria-busy": pending }}
        pagination={{
          page, pageSize, pageSizes, rowsShown: pending ? null : rowsShown, totalRows: pending ? undefined : total,
          itemLabel: { singular: "submission", plural: "submissions" }, disabled: pending,
          onPageChange: next => load(semesterId, next, pageSize),
          onPageSizeChange: size => load(semesterId, 1, size),
        }}>
        <thead><tr>
          <TableCell variant="header" className="w-[28%]!">Faculty member</TableCell>
          <TableCell variant="header" className="w-[15%]!">Course</TableCell>
          <TableCell variant="header" className="w-[22%]!">Submitted</TableCell>
          <TableCell variant="header" className="w-[15%]!">Satisfaction</TableCell>
          <TableCell variant="header" className="w-[20%]!">Action</TableCell>
        </tr></thead>
        <tbody>{!pending && (rowsShown > 0 ? children : <tr>
          <td colSpan={5} className="p-ah-24 text-muted">No feedback has been submitted for this semester.</td>
        </tr>)}</tbody>
      </Table>}
  </div>;
}
