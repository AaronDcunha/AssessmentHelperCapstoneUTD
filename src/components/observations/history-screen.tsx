"use client";

import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";

export type FacultyHistoryRecord = {
  id: string;
  semester: string;
  role: "Observer" | "Observee";
  courseSection: string;
  otherProfessor: string;
  status: string;
  /** Optional existing, authorized submitted-form destination; never guess a URL. */
  formHref?: string;
};

/** Display only server-authorized past records. These filters are not access checks. */
export function FacultyHistoryScreen({ records }: { records: readonly FacultyHistoryRecord[] }) {
  const [semester, setSemester] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const semesters = [...new Set(records.map((record) => record.semester))];
  const statuses = [...new Set(records.map((record) => record.status))];
  const filtered = records.filter((record) =>
    (!semester || record.semester === semester)
    && (!role || record.role === role)
    && (!status || record.status === status),
  );

  return (
    <div className="space-y-ah-24">
      <div role="group" aria-label="Filter observation history" className="grid gap-ah-16 md:grid-cols-3">
        <Select label="Semester" value={semester} onChange={(event) => setSemester(event.target.value)}>
          <option value="">All</option>
          {semesters.map((value) => <option key={value} value={value}>{value}</option>)}
        </Select>
        <Select label="Role: Observer / Observee" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="">All</option>
          <option value="Observer">Observer</option>
          <option value="Observee">Observee</option>
        </Select>
        <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All</option>
          {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
        </Select>
      </div>

      <section aria-labelledby="history-records-heading" className="space-y-ah-16">
        <h2 id="history-records-heading" className="text-section">Completed and past observations</h2>
        <div className="overflow-x-auto rounded-ah-8 border border-border">
          <table className="w-full">
            <caption className="sr-only">Past observations as an Observer or Observee across semesters</caption>
            <thead><tr>
              {["Semester", "Role", "Course / Section", "Other professor", "Status / Action"].map((heading) => (
                <TableCell key={heading} variant="header">{heading}</TableCell>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.id} className="border-t border-border">
                  <TableCell>{record.semester}</TableCell>
                  <TableCell>{record.role}</TableCell>
                  <TableCell>{record.courseSection}</TableCell>
                  <TableCell>{record.otherProfessor}</TableCell>
                  <TableCell>
                    <p className="text-caption text-muted">{record.status}</p>
                    {record.formHref && <ButtonLink href={record.formHref} variant="secondary" className="mt-ah-8">View Form</ButtonLink>}
                  </TableCell>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="bg-surface p-ah-32 text-center text-muted">
                  {records.length === 0 ? "No completed or past observation records are available." : "No observations match the selected filters."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p role="status" aria-live="polite" aria-atomic="true" className="text-caption text-muted">
          {filtered.length} {filtered.length === 1 ? "record" : "records"}{role ? ` as ${role}` : ""} shown.
        </p>
      </section>

      <p className="rounded-ah-8 border border-border bg-surface p-ah-24">
        Select a completed record to view its submitted form and details.
      </p>
    </div>
  );
}
