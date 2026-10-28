"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";
import { TextAction } from "@/components/ui/text-action";
import { Button, ButtonLink } from "@/components/ui/button";
import { UpIcon, DownIcon } from "@/components/ui/icons";
import { HistoryFilterPicker } from "./history-filter-picker";
import { useHistoryToolbarMotion } from "./use-history-toolbar-motion";
import { facultyRoutes } from "./faculty-routes";
import {
  filterObservationHistory,
  sortObservationHistory,
  historySemesterYears,
  type HistorySort,
  type HistorySortKey,
  type HistoryDisplayFilters,
  type ObservationHistoryRecord,
} from "@/lib/observation-history";
import styles from "./observation-history.module.css";

export type HistoryPreviewState = "ready" | "loading" | "error" | "denied";
const noFilters: HistoryDisplayFilters = {
  semester: "",
  participation: "",
  statusLabel: "",
  semesters: [],
  search: "",
};
const columns: { key: HistorySortKey; label: string }[] = [
  { key: "courseSection", label: "Course / Section" },
  { key: "semester", label: "Semester" },
  { key: "participation", label: "Role" },
  { key: "otherProfessor", label: "Professor" },
  { key: "statusLabel", label: "Status" },
];

/** History content composes shared controls and cells; it owns no shell or auth. */
export function ObservationHistory({
  records,
  initialState = "ready",
  onRetry,
  errorMessage,
}: {
  records: readonly ObservationHistoryRecord[];
  initialState?: HistoryPreviewState;
  onRetry?: () => void;
  errorMessage?: string;
}) {
  const [filters, setFilters] = useState(noFilters);
  const [sort, setSort] = useState<HistorySort>({ key: "semester", direction: "desc" });
  const router = useRouter();
  const toolbar = useHistoryToolbarMotion();
  const viewState = initialState;
  const disabled = viewState !== "ready";
  const visibleRecords = sortObservationHistory(filterObservationHistory(records, filters), sort);
  const selectedSemesters = filters.semesters ?? [];
  const years = historySemesterYears(records);
  const otherSemesters = [...new Set(records.map((record) => record.semester))].filter(
    (semester) => !/^(Spring|Summer|Fall) \d{4}$/.test(semester),
  );
  const statuses = [...new Set(records.map((record) => record.statusLabel))];
  const hasFilters = Boolean(
    selectedSemesters.length ||
      filters.participation ||
      filters.statusLabel ||
      filters.search?.trim(),
  );
  const semesterLabel =
    selectedSemesters.length === 1
      ? selectedSemesters[0]
      : selectedSemesters.length
        ? `${selectedSemesters.length} semesters`
        : "Semester";

  function toggleSemester(semester: string) {
    setFilters((previous) => ({
      ...previous,
      semesters: previous.semesters?.includes(semester)
        ? previous.semesters.filter((value) => value !== semester)
        : [...(previous.semesters ?? []), semester],
    }));
  }
  function changeSort(key: HistorySortKey) {
    setSort((previous) => ({
      key,
      direction:
        previous.key === key
          ? previous.direction === "asc"
            ? "desc"
            : "asc"
          : key === "semester"
            ? "desc"
            : "asc",
    }));
  }
  function semesterTile(semester: string, label: string) {
    if (!records.some((record) => record.semester === semester)) return null;
    return (
      <button
        key={semester}
        type="button"
        aria-pressed={selectedSemesters.includes(semester)}
        aria-label={semester}
        className={styles.semesterTile}
        onClick={() => toggleSemester(semester)}
      >
        <span>{label}</span>
        <small>{semester.slice(label.length).trim()}</small>
      </button>
    );
  }

  return (
    <div className={styles.pageContent}>
      <div ref={toolbar} className={styles.toolbar} aria-label="History controls">
        <div className={styles.roleTabs} data-role-tabs role="group" aria-label="Filter by role">
          <span className={styles.roleIndicator} data-role-indicator aria-hidden="true" />
          {(
            [
              ["", "All"],
              ["observee", "Observee"],
              ["observer", "Observer"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              aria-pressed={filters.participation === value}
              onClick={() => setFilters((previous) => ({ ...previous, participation: value }))}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.tools}>
          <div className={styles.search} data-history-motion="search">
            <Input
              type="search"
              label="Search observations"
              placeholder="Search course or professor…"
              value={filters.search ?? ""}
              disabled={disabled}
              onChange={(event) =>
                setFilters((previous) => ({ ...previous, search: event.target.value }))
              }
            />
          </div>
          <HistoryFilterPicker
            name="Choose semesters"
            label={semesterLabel}
            active={selectedSemesters.length > 0}
            disabled={disabled}
          >
            {() => (
              <div className={styles.semesterGrid}>
                {years.flatMap((year) =>
                  ["Spring", "Summer", "Fall"].map((season) =>
                    semesterTile(`${season} ${year}`, season),
                  ),
                )}
                {otherSemesters.map((semester) => semesterTile(semester, semester))}
                {!years.length && !otherSemesters.length && (
                  <p className="text-body text-muted">No semesters in your history yet.</p>
                )}
              </div>
            )}
          </HistoryFilterPicker>
          <HistoryFilterPicker
            name="Choose status"
            label={filters.statusLabel || "Status"}
            active={Boolean(filters.statusLabel)}
            disabled={disabled}
          >
            {(close) => (
              <>
                <div className={styles.pickerHeading}>
                  <strong>Observation status</strong>
                  <span>In your history</span>
                </div>
                <div className={styles.statusOptions}>
                  {["", ...statuses].map((status) => (
                    <button
                      key={status || "all"}
                      type="button"
                      aria-pressed={filters.statusLabel === status}
                      onClick={() => {
                        setFilters((previous) => ({ ...previous, statusLabel: status }));
                        close();
                      }}
                    >
                      <span
                        className={`${styles.statusDot} ${status.toLowerCase() === "completed" ? styles.completed : ""}`}
                      />
                      <span>{status || "All statuses"}</span>
                      <span className={styles.statusCount}>
                        {status
                          ? records.filter((record) => record.statusLabel === status).length
                          : records.length}
                      </span>
                      <span aria-hidden="true" className={styles.check}>
                        {filters.statusLabel === status ? "✓" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </HistoryFilterPicker>
          {hasFilters && (
            <TextAction className={styles.clearFilters} onClick={() => setFilters(noFilters)}>
              Clear filters
            </TextAction>
          )}
        </div>
      </div>
      <section aria-label="Observation history" className={styles.historySection}>
        <div
          className={styles.tableScroll}
          tabIndex={0}
          role="region"
          aria-label="Observation history table"
        >
          <table className={styles.table} aria-busy={viewState === "loading"}>
            <caption className="sr-only">
              Observations received as an observee and performed as an observer
            </caption>
            <colgroup>
              <col style={{ width: "21%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    variant="header"
                    aria-sort={
                      sort.key === column.key
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button
                      className={styles.sortButton}
                      type="button"
                      disabled={disabled}
                      onClick={() => changeSort(column.key)}
                      aria-label={`Sort by ${column.label}${sort.key === column.key ? (sort.direction === "asc" ? ", currently ascending" : ", currently descending") : ""}`}
                    >
                      {column.label}
                      <span className={styles.sortArrows} aria-hidden="true">
                        <UpIcon
                          size={10}
                          className={
                            sort.key === column.key && sort.direction === "asc"
                              ? styles.currentSort
                              : ""
                          }
                        />
                        <DownIcon
                          size={10}
                          className={
                            sort.key === column.key && sort.direction === "desc"
                              ? styles.currentSort
                              : ""
                          }
                        />
                      </span>
                    </button>
                  </TableCell>
                ))}
                <TableCell variant="header">Actions</TableCell>
              </tr>
            </thead>
            <tbody>
              {viewState === "ready" &&
                visibleRecords.map((record) => (
                  <tr key={record.id}>
                    <TableCell>{record.courseSection}</TableCell>
                    <TableCell>{record.semester}</TableCell>
                    <TableCell>
                      {record.participation === "observer" ? "Observer" : "Observee"}
                    </TableCell>
                    <TableCell>{record.otherProfessor}</TableCell>
                    <TableCell>
                      <span className={styles.recordStatus}>
                        <span
                          aria-hidden="true"
                          className={`${styles.statusDot} ${record.statusLabel.toLowerCase() === "completed" ? styles.completed : ""}`}
                        />
                        {record.statusLabel}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ButtonLink
                        variant="secondary"
                        className={styles.viewForm}
                        href={`${facultyRoutes.details}?observationId=${encodeURIComponent(record.id)}`}
                        aria-label={`View details for ${record.courseSection}, ${record.semester}, ${record.participation}`}
                      >
                        View details
                      </ButtonLink>
                    </TableCell>
                  </tr>
                ))}
              {viewState === "ready" && visibleRecords.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.stateCell}>
                    <p role="status">
                      {records.length === 0
                        ? "No previous observation records are available."
                        : "No observations match your search or filters."}
                    </p>
                  </td>
                </tr>
              )}
              {viewState === "loading" &&
                Array.from({ length: 4 }, (_, row) => (
                  <tr key={`skeleton-${row}`} aria-hidden="true" className={styles.skeletonRow}>
                    {Array.from({ length: 6 }, (_, column) => (
                      <TableCell key={column}>
                        <span
                          className={`${styles.skeleton} ${column === 5 ? styles.skeletonButton : styles.skeletonText}`}
                        />
                      </TableCell>
                    ))}
                  </tr>
                ))}
              {viewState === "error" && (
                <tr>
                  <td colSpan={6} className={styles.stateCell}>
                    <p role="alert">{errorMessage ?? "Observation history could not be loaded. Please try again."}</p>
                    <Button variant="secondary" onClick={onRetry ?? (() => router.refresh())}>
                      Try again
                    </Button>
                  </td>
                </tr>
              )}
              {viewState === "denied" && (
                <tr>
                  <td colSpan={6} className={styles.stateCell}>
                    <p role="alert">
                      You do not have permission to view these observation records.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className={styles.resultCount} role="status">
        {viewState === "ready"
          ? `${visibleRecords.length} ${visibleRecords.length === 1 ? "observation" : "observations"}${hasFilters ? ` of ${records.length}` : ""}`
          : ""}
      </p>

    </div>
  );
}
