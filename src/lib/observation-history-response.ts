import type { ObservationHistoryRecord } from "./observation-history";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid observation resource.");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Invalid observation field.");
  return value;
}

/** Map the shared Observation DTO into the history presentation model. */
export function parseObservationHistoryResponse(value: unknown): ObservationHistoryRecord[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { items?: unknown }).items)) {
    throw new Error("Invalid observation history response.");
  }
  const ids = new Set<string>();
  return (value as { items: unknown[] }).items.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid observation history record.");
    const record = object(item),
      section = object(record.section),
      course = object(section.course),
      semester = object(section.semester);
    const id = text(record.id),
      status = text(record.status);
    if (
      !Array.isArray(record.participation) ||
      record.participation.length !== 1 ||
      !["observee", "observer"].includes(record.participation[0])
    )
      throw new Error("Invalid participation.");
    const participation = record.participation[0] as "observee" | "observer";
    if (section.semesterId !== undefined && text(section.semesterId) !== text(semester.id)) throw new Error("Mismatched semester.");
    const other =
      participation === "observer"
        ? object(record.observee)
        : record.observer === null
          ? null
          : object(record.observer);
    if (ids.has(id)) throw new Error("Duplicate history record.");
    ids.add(id);
    return {
      id,
      semester: text(semester.name),
      participation,
      courseSection: `${text(course.code)}.${text(section.sectionNumber)}`,
      otherProfessor: other ? text(other.name) : "Not assigned",
      statusLabel: status === "COMPLETED" ? "Completed" : status,
    };
  });
}
