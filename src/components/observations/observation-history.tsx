"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";
import { TextAction } from "@/components/ui/text-action";
import { Button } from "@/components/ui/button";
import { UpIcon, DownIcon } from "@/components/ui/icons";
import { HistoryFilterPicker } from "./history-filter-picker";
import { useHistoryToolbarMotion } from "./use-history-toolbar-motion";
import { getObservationFormResources, ObservationApiError } from "@/lib/observations-api";
import {
  parseSubmittedObservationForm,
  type SubmittedObservationForm,
} from "@/lib/observation-form";
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
}: {
  records: readonly ObservationHistoryRecord[];
  initialState?: HistoryPreviewState;
  onRetry?: () => void;
}) {
  const [filters, setFilters] = useState(noFilters);
  const [sort, setSort] = useState<HistorySort>({ key: "semester", direction: "desc" });
  const router = useRouter();
  const toolbar = useHistoryToolbarMotion();
  const [selected, setSelected] = useState<ObservationHistoryRecord | null>(null);
  const [form, setForm] = useState<SubmittedObservationForm | null>(null);
  const [formMessage, setFormMessage] = useState("");
  const [formAttempt, setFormAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitle = useId();
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

  useEffect(() => {
    if (!selected) return;
    const observationId = selected.id;
    const controller = new AbortController();
    async function loadForm() {
      try {
        const resources = await getObservationFormResources(observationId, {
          signal: controller.signal,
        });
        const submitted = parseSubmittedObservationForm(observationId, resources);
        if (controller.signal.aborted) return;
        setForm(submitted);
        setFormMessage(submitted ? "" : "The submitted form is not available yet.");
      } catch (error) {
        if (controller.signal.aborted) return;
        setFormMessage(
          error instanceof ObservationApiError && error.status === 404
            ? "The submitted form is not available yet."
            : error instanceof ObservationApiError
              ? error.message
              : "The submitted form could not be loaded. Please try again.",
        );
      }
    }
    void loadForm();
    return () => controller.abort();
  }, [selected, formAttempt]);

  function viewRecord(record: ObservationHistoryRecord) {
    setForm(null);
    setFormMessage("");
    setSelected(record);
    dialog.current?.showModal();
  }
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
                      <Button
                        variant="secondary"
                        className={styles.viewForm}
                        onClick={() => viewRecord(record)}
                        aria-label={`View Form for ${record.courseSection}, ${record.semester}, ${record.participation}`}
                      >
                        View Form
                      </Button>
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
                    <p role="alert">Observation history could not be loaded. Please try again.</p>
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
      <dialog
        ref={dialog}
        aria-labelledby={dialogTitle}
        onClose={() => setSelected(null)}
        className="m-auto max-h-[calc(100dvh-32px)] w-[min(560px,calc(100vw-32px))] overflow-y-auto rounded-ah-12 border border-border bg-surface p-ah-32 text-ink backdrop:bg-ink/40"
      >
        <h2 id={dialogTitle} className="text-section">
          Observation record
        </h2>
        {selected && (
          <>
            <dl className="my-ah-24 grid grid-cols-2 gap-x-ah-24 gap-y-ah-16 text-body">
              <dt className="text-muted">Semester</dt>
              <dd>{selected.semester}</dd>
              <dt className="text-muted">Role</dt>
              <dd>{selected.participation === "observer" ? "Observer" : "Observee"}</dd>
              <dt className="text-muted">Course / Section</dt>
              <dd>{selected.courseSection}</dd>
              <dt className="text-muted">Other professor</dt>
              <dd>{selected.otherProfessor}</dd>
              <dt className="text-muted">Status</dt>
              <dd>{selected.statusLabel}</dd>
            </dl>
            {form && (
              <section
                aria-label="Submitted assessment"
                className="space-y-ah-16 border-t border-border pt-ah-16"
              >
                <h3 className="text-section">{form.title}</h3>
                <p className="text-caption text-muted">
                  Completed{" "}
                  <time dateTime={form.completedAt}>
                    {new Date(form.completedAt).toLocaleString()}
                  </time>
                </p>
                <dl className="space-y-ah-16">
                  {form.questions.map((item) => (
                    <div key={item.id}>
                      <dt className="text-label">{item.prompt}</dt>
                      <dd className="mt-ah-4 whitespace-pre-wrap break-words text-body">
                        {item.answer}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {!form && !formMessage && (
              <div
                role="status"
                aria-label="Loading submitted form"
                className={styles.formSkeleton}
              >
                <span aria-hidden="true" className={`${styles.skeleton} ${styles.skeletonText}`} />
                <span aria-hidden="true" className={`${styles.skeleton} ${styles.skeletonText}`} />
                <span aria-hidden="true" className={`${styles.skeleton} ${styles.skeletonText}`} />
              </div>
            )}
            {formMessage && (
              <p role="status" className="text-body text-muted">
                {formMessage}
              </p>
            )}
            {formMessage && (
              <TextAction
                onClick={() => {
                  setFormMessage("");
                  setFormAttempt((attempt) => attempt + 1);
                }}
              >
                Try again
              </TextAction>
            )}
          </>
        )}
        <form method="dialog" className="mt-ah-24 flex justify-end">
          <Button type="submit">Close</Button>
        </form>
      </dialog>
    </div>
  );
}
