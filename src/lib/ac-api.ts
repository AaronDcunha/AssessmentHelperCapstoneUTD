export const CURRENT_CYCLE_ID = "current";

export type UserSummary = { id: string; name?: string | null; displayName?: string | null; username?: string | null };
export type Cycle = {
  id: string; semesterId?: string;
  semester?: { id?: string; name?: string; title?: string; season?: string; year?: number; startsOn?: string | null; endsOn?: string | null; revision?: number } | null;
  signupDeadline?: string | null; observationDeadline?: string | null; feedbackDeadline?: string | null;
  status?: string | null; revision?: number;
};
export type ReportsResponse = {
  cycleId: string; asOf?: string; definitionsVersion?: string;
  summary: { facultyDue: number; overdue: number; unmatched: number; incomplete: number };
  byHiringLevel: Array<{ hiringLevelId: string; name: string; due: number; outstanding: number }>;
  availableViews?: string[];
};
export type FacultyStatusItem = {
  professor: UserSummary; hiringLevel: { id: string; name: string } | string;
  lastEvaluation: { semesterId: string; completedAt?: string | null } | null;
  evaluationStatus: string; signupId?: string | null; observationId?: string | null;
};
export type AttentionItem = {
  id: string; faculty: UserSummary;
  issue: "overdue" | "unmatched" | "incomplete" | "alert" | "expiredApproval";
  observationStatus: string; observationId?: string | null;
};
export type ObservationItem = {
  id: string; observee?: UserSummary | null; observer?: UserSummary | null;
  course?: { code?: string; title?: string; name?: string } | string | null;
  section?: { course?: { code?: string; title?: string; name?: string } | null } | null;
  status?: string | null; assessmentStatus?: string | null;
};
export type ObservationDetail = {
  observation: ObservationItem;
  proposedMeetings?: Array<{ id?: string; startsAt?: string; endsAt?: string }>;
  progress?: Array<{ key: string; label: string; state: string; completedAt?: string | null }>;
  pendingAlert?: unknown; templateVersionId?: string | null;
};
export type MetricsResponse = {
  cycleId: string; available: boolean; availableAt?: string | null; generatedAt?: string | null;
  formulaVersion?: string | null;
  metrics: Array<{ key: string; label: string; value: number | null; unit?: string; unavailableReason?: string }>;
};
export type CycleWrite = { semesterId: string; signupDeadline: string; observationDeadline: string; feedbackDeadline: string };
export type HiringLevel = { id: string; name: string; evaluationIntervalYears?: number; active?: boolean };
export type ObservationTemplate = {
  id: string; title: string; revision?: number;
  criteria: Array<{ id: string; prompt?: string; questionText?: string; label?: string; required?: boolean; weight?: number }>;
};
export type ObservationTemplateWrite = {
  title: string;
  criteria: Array<{ id: string; prompt: string; required: boolean; weight: number }>;
  commentPrompts: string[];
  signatureLabels: string[];
};

export class ApiRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

function queryString(values: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && value !== "all") query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  if (!response.ok) throw new ApiRequestError(`Request failed with status ${response.status}.`, response.status);
  return response.json() as Promise<T>;
}

const cyclePath = (cycleId: string) => `/api/evaluation-cycles/${encodeURIComponent(cycleId)}`;

export const acApi = {
  getEvaluationCycles: (filters: { semesterId?: string; status?: string } = {}) => requestJson<Cycle[]>(`/api/evaluation-cycles${queryString(filters)}`),
  getEvaluationCycle: (cycleId: string) => requestJson<Cycle>(cyclePath(cycleId)),
  getReports: (cycleId: string, filters: { departmentId?: string; hiringLevelId?: string } = {}) => requestJson<ReportsResponse>(`${cyclePath(cycleId)}/reports${queryString(filters)}`),
  getFacultyStatus: (cycleId: string, filters: { hiringLevelId?: string; evaluationStatus?: string } = {}) => requestJson<FacultyStatusItem[]>(`${cyclePath(cycleId)}/faculty-status${queryString(filters)}`),
  getAttention: (cycleId: string, filters: { issue?: string; departmentId?: string } = {}) => requestJson<AttentionItem[]>(`${cyclePath(cycleId)}/attention${queryString(filters)}`),
  getObservations: (cycleId: string, filters: { status?: string; assessmentStatus?: string } = {}) => requestJson<ObservationItem[]>(`${cyclePath(cycleId)}/observations${queryString(filters)}`),
  getMetrics: (cycleId: string, filters: { departmentId?: string } = {}) => requestJson<MetricsResponse>(`${cyclePath(cycleId)}/metrics${queryString(filters)}`),
  getObservation: (observationId: string) => requestJson<ObservationDetail>(`/api/observations/${encodeURIComponent(observationId)}`),
  getHiringLevels: () => requestJson<HiringLevel[]>("/api/hiring-levels"),
  createCycle: (body: CycleWrite) => requestJson<Cycle>("/api/evaluation-cycles", { method: "POST", body: JSON.stringify(body) }),
  updateCycle: (cycleId: string, body: Partial<CycleWrite> & { expectedRevision: number }) => requestJson<Cycle>(cyclePath(cycleId), { method: "PATCH", body: JSON.stringify(body) }),
  updateCycleSettings: (cycleId: string, body: {
    expectedCycleRevision: number; expectedSemesterRevision: number;
    semester: { startsOn: string; endsOn: string };
    deadlines: { signupDeadline: string; observationDeadline: string; feedbackDeadline: string };
  }) => requestJson<{ semester: Cycle["semester"]; cycle: Cycle }>(`${cyclePath(cycleId)}/settings`, { method: "PUT", body: JSON.stringify(body) }),
  getCurrentTemplate: (cycleId: string) => requestJson<ObservationTemplate>(`/api/observation-templates/current${queryString({ cycleId })}`),
  createTemplate: (body: ObservationTemplateWrite) => requestJson<ObservationTemplate>("/api/observation-templates", { method: "POST", body: JSON.stringify(body) }),
  updateTemplate: (templateId: string, body: ObservationTemplateWrite & { expectedRevision: number }) => requestJson<ObservationTemplate>(`/api/observation-templates/${encodeURIComponent(templateId)}`, { method: "PATCH", body: JSON.stringify(body) }),
};

export function userDisplayName(user?: UserSummary | null) {
  return user?.displayName?.trim() || user?.name?.trim() || user?.username?.trim() || "—";
}
export function cycleDisplayName(cycle: Cycle) {
  const semester = cycle.semester;
  if (semester?.title?.trim()) return semester.title;
  if (semester?.name?.trim()) return semester.name;
  if (semester?.season && semester.year) return `${semester.season} ${semester.year}`;
  return cycle.semesterId || cycle.id;
}
