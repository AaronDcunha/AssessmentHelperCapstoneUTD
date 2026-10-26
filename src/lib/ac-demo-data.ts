import type { AttentionItem, FacultyStatusItem, HiringLevel, MetricsResponse, ObservationItem, ReportsResponse } from "@/lib/ac-api";

/** Presentation-only fallback records. These values never represent database data. */
export type DemoRecord<T> = T & { demo: true };

export const DEMO_HIRING_LEVELS: HiringLevel[] = [
  { id: "demo-assistant-professor", name: "Assistant Professor" },
  { id: "demo-associate-professor", name: "Associate Professor" },
  { id: "demo-senior-lecturer", name: "Senior Lecturer" },
];

export const DEMO_FACULTY_STATUSES: Array<DemoRecord<FacultyStatusItem>> = [
  {
    demo: true,
    professor: { id: "demo-faculty-1", displayName: "Dr. Maya Patel" },
    hiringLevel: DEMO_HIRING_LEVELS[0],
    lastEvaluation: { semester: { id: "demo-spring-2025", name: "Spring 2025" } },
    evaluationStatus: "due",
    signupId: "demo-signup-1",
  },
  {
    demo: true,
    professor: { id: "demo-faculty-2", displayName: "Dr. Jordan Lee" },
    hiringLevel: DEMO_HIRING_LEVELS[1],
    lastEvaluation: { semester: { id: "demo-fall-2024", name: "Fall 2024" } },
    evaluationStatus: "overdue",
    signupId: null,
  },
  {
    demo: true,
    professor: { id: "demo-faculty-3", displayName: "Prof. Elena Garcia" },
    hiringLevel: DEMO_HIRING_LEVELS[2],
    lastEvaluation: { semester: { id: "demo-fall-2025", name: "Fall 2025" } },
    evaluationStatus: "due",
    signupId: "demo-signup-3",
  },
  {
    demo: true,
    professor: { id: "demo-faculty-4", displayName: "Dr. Marcus Thompson" },
    hiringLevel: DEMO_HIRING_LEVELS[0],
    lastEvaluation: { semester: { id: "demo-spring-2024", name: "Spring 2024" } },
    evaluationStatus: "overdue",
    signupId: "demo-signup-4",
  },
  {
    demo: true,
    professor: { id: "demo-faculty-5", displayName: "Prof. Nina Brooks" },
    hiringLevel: DEMO_HIRING_LEVELS[2],
    lastEvaluation: null,
    evaluationStatus: "overdue",
    signupId: null,
  },
  {
    demo: true,
    professor: { id: "demo-faculty-6", displayName: "Dr. Samuel Kim" },
    hiringLevel: DEMO_HIRING_LEVELS[1],
    lastEvaluation: { semester: { id: "demo-spring-2025", name: "Spring 2025" } },
    evaluationStatus: "due",
    signupId: null,
  },
];

const facultyFilterCache = new Map<string, Array<DemoRecord<FacultyStatusItem>>>();

export function demoFacultyStatuses(hiringLevelId = "all", evaluationStatus = "all") {
  const key = `${hiringLevelId}:${evaluationStatus}`;
  const cached = facultyFilterCache.get(key);
  if (cached) return cached;
  const rows = DEMO_FACULTY_STATUSES.filter((item) => {
    const levelId = typeof item.hiringLevel === "string" ? item.hiringLevel : item.hiringLevel.id;
    return (hiringLevelId === "all" || levelId === hiringLevelId)
      && (evaluationStatus === "all" || item.evaluationStatus === evaluationStatus);
  });
  facultyFilterCache.set(key, rows);
  return rows;
}

export const DEMO_OBSERVATIONS: Array<DemoRecord<ObservationItem>> = [
  { demo: true, id: "demo-observation-1", observee: { id: "demo-observee-1", displayName: "Dr. Maya Patel" }, observer: { id: "demo-observer-1", displayName: "Prof. Alex Morgan" }, course: { code: "CS 1337" }, status: "in-progress" },
  { demo: true, id: "demo-observation-2", observee: { id: "demo-observee-2", displayName: "Dr. Jordan Lee" }, observer: { id: "demo-observer-2", displayName: "Dr. Priya Shah" }, course: { code: "CS 3345" }, status: "complete" },
  { demo: true, id: "demo-observation-3", observee: { id: "demo-observee-3", displayName: "Prof. Elena Garcia" }, observer: { id: "demo-observer-3", displayName: "Dr. Daniel Reed" }, course: { code: "SE 3306" }, status: "incomplete" },
  { demo: true, id: "demo-observation-4", observee: { id: "demo-observee-4", displayName: "Dr. Marcus Thompson" }, observer: null, course: { code: "CS 4347" }, status: "unmatched" },
  { demo: true, id: "demo-observation-5", observee: { id: "demo-observee-5", displayName: "Prof. Nina Brooks" }, observer: { id: "demo-observer-5", displayName: "Dr. Owen Clark" }, course: { code: "CS 4390" }, status: "in-progress" },
  { demo: true, id: "demo-observation-6", observee: { id: "demo-observee-6", displayName: "Dr. Samuel Kim" }, observer: { id: "demo-observer-6", displayName: "Prof. Renee Foster" }, course: { code: "CS 6363" }, status: "complete" },
];

const observationFilterCache = new Map<string, Array<DemoRecord<ObservationItem>>>();

export function demoObservations(status = "all") {
  const cached = observationFilterCache.get(status);
  if (cached) return cached;
  const rows = DEMO_OBSERVATIONS.filter((item) => status === "all" || item.status === status);
  observationFilterCache.set(status, rows);
  return rows;
}

export const DEMO_ATTENTION_ITEMS: Array<DemoRecord<AttentionItem>> = [
  { demo: true, id: "demo-attention-1", faculty: { id: "demo-faculty-2", displayName: "Dr. Jordan Lee" }, issue: "overdue", observationStatus: "Not scheduled" },
  { demo: true, id: "demo-attention-2", faculty: { id: "demo-faculty-4", displayName: "Dr. Marcus Thompson" }, issue: "incomplete", observationStatus: "Assessment pending" },
  { demo: true, id: "demo-attention-3", faculty: { id: "demo-faculty-5", displayName: "Prof. Nina Brooks" }, issue: "unmatched", observationStatus: "Observer needed" },
  { demo: true, id: "demo-attention-4", faculty: { id: "demo-faculty-6", displayName: "Dr. Samuel Kim" }, issue: "incomplete", observationStatus: "Acknowledgement pending" },
];

const dueCount = DEMO_FACULTY_STATUSES.filter((item) => item.evaluationStatus === "due").length;
const overdueCount = DEMO_FACULTY_STATUSES.filter((item) => item.evaluationStatus === "overdue").length;
const unmatchedCount = DEMO_OBSERVATIONS.filter((item) => item.status === "unmatched").length;
const incompleteCount = DEMO_OBSERVATIONS.filter((item) => item.status === "incomplete").length;
const completeCount = DEMO_OBSERVATIONS.filter((item) => item.status === "complete").length;
const assignedObserverCount = DEMO_OBSERVATIONS.filter((item) => item.observer != null).length;
const demoPercent = (count: number) => Math.round(count / DEMO_OBSERVATIONS.length * 100);

export const DEMO_REPORT: DemoRecord<ReportsResponse> = {
  demo: true,
  cycleId: "demo-cycle",
  summary: { facultyDue: dueCount, overdue: overdueCount, unmatched: unmatchedCount, incomplete: incompleteCount },
  byHiringLevel: [
    { hiringLevelId: "demo-assistant-professor", name: "Assistant Professor", due: 1, outstanding: 1 },
    { hiringLevelId: "demo-associate-professor", name: "Associate Professor", due: 1, outstanding: 1 },
    { hiringLevelId: "demo-senior-lecturer", name: "Senior Lecturer", due: 1, outstanding: 1 },
  ],
};

export const DEMO_METRICS: DemoRecord<MetricsResponse> = {
  demo: true,
  cycleId: "demo-cycle",
  available: true,
  formulaVersion: "frontend-demo-only",
  metrics: [
    { key: "participationRate", label: "Participation rate", value: demoPercent(completeCount), unit: "%" },
    { key: "observerUtilizationRate", label: "Observer utilization", value: demoPercent(assignedObserverCount), unit: "%" },
    { key: "listSufficiencyRate", label: "List sufficiency", value: demoPercent(assignedObserverCount), unit: "%" },
    { key: "incompleteObservations", label: "Incomplete observations", value: incompleteCount },
  ],
};

export const DEMO_EXECUTIVE_SUMMARIES = [
  `${dueCount} faculty members are due for evaluation in this example cycle; ${overdueCount} are currently overdue.`,
  `${unmatchedCount} observation still needs an observer match, while ${incompleteCount} is incomplete.`,
  `${completeCount} of the ${DEMO_OBSERVATIONS.length} example observations are complete.`,
] as const;

export function isDemoRecord(value: unknown): value is { demo: true } {
  return typeof value === "object" && value !== null && "demo" in value && value.demo === true;
}
