import type { ObservationParticipation } from "./observations-api";

// Presentation model derived from Figma, not an agreed backend response DTO.
export interface ObservationHistoryRecord {
  id: string;
  semester: string;
  participation: ObservationParticipation;
  courseSection: string;
  otherProfessor: string;
  statusLabel: string;
}

export interface HistoryDisplayFilters {
  semester: string;
  participation: ObservationParticipation | "";
  statusLabel: string;
  semesters?: readonly string[];
  search?: string;
}

export function filterObservationHistory(
  records: readonly ObservationHistoryRecord[],
  filters: HistoryDisplayFilters,
): ObservationHistoryRecord[] {
  return records.filter(
    (record) =>
      (!filters.semester || record.semester === filters.semester) &&
      (!filters.semesters?.length || filters.semesters.includes(record.semester)) &&
      (!filters.participation || record.participation === filters.participation) &&
      (!filters.statusLabel || record.statusLabel === filters.statusLabel) &&
      (!filters.search?.trim() ||
        [record.courseSection, record.otherProfessor, record.semester].some((value) =>
          value.toLocaleLowerCase().includes(filters.search!.trim().toLocaleLowerCase()),
        )),
  );
}

export type HistorySortKey =
  | "courseSection"
  | "semester"
  | "participation"
  | "otherProfessor"
  | "statusLabel";
export interface HistorySort {
  key: HistorySortKey;
  direction: "asc" | "desc";
}

export function semesterOrder(semester: string): number | null {
  const match = /^(Spring|Summer|Fall) (\d{4})$/.exec(semester);
  return match ? Number(match[2]) * 3 + ["Spring", "Summer", "Fall"].indexOf(match[1]) : null;
}

export function sortObservationHistory(
  records: readonly ObservationHistoryRecord[],
  sort: HistorySort,
): ObservationHistoryRecord[] {
  return [...records].sort((a, b) => {
    const aOrder = sort.key === "semester" ? semesterOrder(a.semester) : null;
    const bOrder = sort.key === "semester" ? semesterOrder(b.semester) : null;
    const result =
      aOrder !== null && bOrder !== null
        ? aOrder - bOrder
        : a[sort.key].localeCompare(b[sort.key], undefined, { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? result : -result;
  });
}

/** Available years come from supplied history; the picker omits terms with no records. */
export function historySemesterYears(records: readonly ObservationHistoryRecord[]): number[] {
  return [
    ...new Set(
      records.flatMap((record) => {
        const match = /^(?:Spring|Summer|Fall) (\d{4})$/.exec(record.semester);
        return match ? [Number(match[1])] : [];
      }),
    ),
  ].sort((a, b) => b - a);
}
