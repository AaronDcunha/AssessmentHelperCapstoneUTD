export type Page<T> = { items: T[]; pageInfo: { nextCursor: string | null; hasMore: boolean } };

export type UserSummary = { id: string; name?: string | null; displayName?: string | null; username?: string | null; email?: string | null };
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
  lastEvaluation: { semester: { id: string; name: string }; completedAt?: string | null } | null;
  evaluationStatus: string; signupId?: string | null; observationId?: string | null;
};
export type AttentionItem = {
  id: string; faculty: UserSummary;
  issue: "overdue" | "unmatched" | "incomplete" | "alert" | "expiredApproval";
  observationStatus: string; observationId?: string | null;
};
export type ObservationMeeting = {
  id: string; sectionId: string; date: string; startsAt: string; endsAt: string;
  timeZone: string; location?: string | null; available?: boolean; reason?: string | null;
};
export type ObserverSelectionSignup = {
  signupId: string; observationId: string; observee: UserSummary;
  section: {
    id: string; sectionNumber: string; semesterId?: string;
    course: { id?: string; code: string; title?: string; departmentId?: string; level?: number };
  };
  proposedMeetings: ObservationMeeting[]; signedUpAt: string;
};
export type ObservationCandidate = {
  id: string; observationId: string; professor: UserSummary;
  availableMeetingOptionIds: string[]; responseStatus?: string | null; outcome?: string | null;
  acceptedMeetingOptionId?: string | null;
  courseHistory?: string | { courseCode?: string; semester?: string; label?: string } | null;
};
export type ObservationCandidatesResponse = {
  observationId: string; generationId?: string; releasedAt: string | null;
  proposedMeetings: ObservationMeeting[]; items: ObservationCandidate[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
};
export type RecommendationGenerationResponse = {
  generationId: string; cycleId: string; status: string; generatedCount: number;
  insufficientCount: number; unmatchedCount: number; generatedAt: string;
};
export type RecommendationReleaseResponse = {
  releaseId: string; releasedObservationIds: string[]; releasedAt: string; notificationCount: number;
};
export type RecommendationRegenerationResponse = {
  generationId: string; observationId: string; candidateCount: number; unmatched: boolean; revision: number;
};
export type ObservationItem = {
  id: string; observee?: UserSummary | null; observer?: UserSummary | null;
  course?: { code?: string; title?: string; name?: string } | string | null;
  section?: { course?: { code?: string; title?: string; name?: string } | null } | null;
  status?: string | null; assessmentStatus?: string | null; revision?: number;
  scheduledMeeting?: ObservationMeeting | null;
};
export type ObservationDetail = {
  observation: ObservationItem;
  proposedMeetings?: ObservationMeeting[];
  progress?: Array<{ key: string; label: string; state: string; completedAt?: string | null }>;
  pendingAlert?: unknown; templateVersionId?: string | null;
};
export type AssignedObservationTemplate = {
  id: string; title: string;
  criteria: Array<{ id: string; key: string; prompt: string; type: string; required: boolean; order: number;
    options?: Array<{ value: number; label: string }>; weight?: number }>;
  commentPrompts: Array<{ id?: string; prompt: string; required: boolean; order: number }>;
  signatureLabels: { observer: string; observee: string };
};
export type ObservationAssessment = {
  id: string; observationId: string; templateVersionId?: string; status: string; revision: number;
  answers: Array<{ criterionId: string; value: number | string | null }>;
  comments: Array<{ promptId: string; text: string }>;
  submittedAt: string | null;
  acknowledgements: Array<{ actorId: string; participantRole: string; acknowledgedAt: string }>;
  allowedActions: string[];
};
export type ObservationAssessmentResponse = {
  observationId: string; templateVersionId?: string; assessment: ObservationAssessment | null; allowedActions: string[];
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
  criteria: Array<{ id: string; key: string; prompt: string; type: "rating" | "text"; required: boolean; order: number;
    options?: Array<{ value: number; label: string }>; weight?: number }>;
  commentPrompts: Array<{ id?: string; prompt: string; required: boolean; order: number }>;
  signatureLabels: { observer: string; observee: string };
};
export type ObservationTemplateWrite = {
  title: string;
  criteria: Array<{ id?: string; key: string; prompt: string; type: "rating" | "text"; required: boolean; order: number;
    options?: Array<{ value: number; label: string }>; weight?: number }>;
  commentPrompts: Array<{ id?: string; prompt: string; required: boolean; order: number }>;
  signatureLabels: { observer: string; observee: string };
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

// Keep array-based page components, but unwrap the contract envelope and follow
// every cursor so filters and "all semesters" do not silently omit later pages.
async function requestList<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let nextPath = path;
  while (true) {
    const page = await requestJson<Page<T>>(nextPath);
    if (!page || !Array.isArray(page.items) || typeof page.pageInfo?.hasMore !== "boolean") {
      throw new ApiRequestError("The API returned an invalid list response.");
    }
    items.push(...page.items);
    if (!page.pageInfo.hasMore) return items;
    const cursor = page.pageInfo.nextCursor;
    if (typeof cursor !== "string" || !cursor || seen.has(cursor)) throw new ApiRequestError("The API returned an invalid pagination cursor.");
    seen.add(cursor);
    const url = new URL(path, "http://local");
    url.searchParams.set("cursor", cursor);
    nextPath = url.pathname + url.search;
  }
}

export const acApi = {
  getEvaluationCycles: (filters: { semesterId?: string; status?: string } = {}) => requestList<Cycle>(`/api/evaluation-cycles${queryString(filters)}`),
  getEvaluationCycle: (cycleId: string) => requestJson<Cycle>(cyclePath(cycleId)),
  getReports: (cycleId: string, filters: { departmentId?: string; hiringLevelId?: string } = {}) => requestJson<ReportsResponse>(`${cyclePath(cycleId)}/reports${queryString(filters)}`),
  getFacultyStatus: (cycleId: string, filters: { hiringLevelId?: string; evaluationStatus?: string } = {}) => requestList<FacultyStatusItem>(`${cyclePath(cycleId)}/faculty-status${queryString(filters)}`),
  getAttention: (cycleId: string, filters: { issue?: string; departmentId?: string } = {}) => requestList<AttentionItem>(`${cyclePath(cycleId)}/attention${queryString(filters)}`),
  getObservations: (cycleId: string, filters: { status?: string; assessmentStatus?: string } = {}) => requestList<ObservationItem>(`${cyclePath(cycleId)}/observations${queryString(filters)}`),
  getObserverSelectionSignups: (cycleId: string) => requestList<ObserverSelectionSignup>(`${cyclePath(cycleId)}/signups`),
  generateRecommendations: (cycleId: string, body: { scope?: { departmentId?: string; professorIds?: string[] } } = {}) =>
    requestJson<RecommendationGenerationResponse>(`${cyclePath(cycleId)}/recommendations/generate`, { method: "POST", body: JSON.stringify(body) }),
  releaseRecommendations: (cycleId: string, body: { generationId: string; observationIds?: string[] }) =>
    requestJson<RecommendationReleaseResponse>(`${cyclePath(cycleId)}/recommendations/release`, { method: "POST", body: JSON.stringify(body) }),
  regenerateObservationRecommendations: (observationId: string, body: { reason?: string; expectedRevision: number }) =>
    requestJson<RecommendationRegenerationResponse>(`/api/observations/${encodeURIComponent(observationId)}/recommendations/regenerate`, { method: "POST", body: JSON.stringify(body) }),
  getObservationCandidates: (observationId: string) =>
    requestJson<ObservationCandidatesResponse>(`/api/observations/${encodeURIComponent(observationId)}/candidates`),
  getMetrics: (cycleId: string, filters: { departmentId?: string } = {}) => requestJson<MetricsResponse>(`${cyclePath(cycleId)}/metrics${queryString(filters)}`),
  getObservation: (observationId: string) => requestJson<ObservationDetail>(`/api/observations/${encodeURIComponent(observationId)}`),
  getObservationTemplate: (observationId: string) => requestJson<AssignedObservationTemplate>(`/api/observations/${encodeURIComponent(observationId)}/template`),
  getObservationAssessment: (observationId: string) => requestJson<ObservationAssessmentResponse>(`/api/observations/${encodeURIComponent(observationId)}/assessment`),
  getHiringLevels: () => requestList<HiringLevel>("/api/hiring-levels"),
  createCycle: (body: CycleWrite) => requestJson<Cycle>("/api/evaluation-cycles", { method: "POST", body: JSON.stringify(body) }),
  updateCycle: (cycleId: string, body: Partial<CycleWrite> & { expectedRevision: number }) => requestJson<Cycle>(cyclePath(cycleId), { method: "PATCH", body: JSON.stringify(body) }),
  updateCycleSettings: (cycleId: string, body: {
    expectedCycleRevision: number; expectedSemesterRevision: number;
    semester: { startsOn: string; endsOn: string };
    deadlines: { signupDeadline: string; observationDeadline: string; feedbackDeadline: string };
  }) => requestJson<{ semester: Cycle["semester"]; cycle: Cycle }>(`${cyclePath(cycleId)}/settings`, { method: "PUT", body: JSON.stringify(body) }),
  getCurrentTemplate: () => requestJson<ObservationTemplate>("/api/observation-templates/current"),
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
