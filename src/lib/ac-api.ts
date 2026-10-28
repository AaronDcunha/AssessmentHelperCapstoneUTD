export type Page<T> = { items: T[]; pageInfo: { nextCursor: string | null; hasMore: boolean } };

export type UserSummary = { id: string; name?: string | null; displayName?: string | null; username?: string | null };
export type Semester = { id: string; name: string; year?: number | null; season?: string | null; startsOn: string | null; endsOn: string | null; timeZone: string; revision: number };
export type Cycle = {
  id: string; semesterId?: string;
  semester?: { id?: string; name?: string; title?: string; season?: string | null; year?: number | null; startsOn?: string | null; endsOn?: string | null; timeZone?: string; revision?: number } | null;
  signupDeadline?: string | null; observationDeadline?: string | null; feedbackDeadline?: string | null;
  status?: string | null; revision?: number;
  allowedActions?: string[];
};
export type ReportsResponse = {
  cycleId: string; asOf?: string; definitionsVersion?: string;
  summary: { facultyDue: number | null; overdue: number | null; unmatched: number; incomplete: number; needsReview?: number };
  byHiringLevel: Array<{ hiringLevelId: string; name: string; due: number | null; outstanding: number; needsReview?: number }>;
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
  observationStatus: string | null; observationId?: string | null;
};
export type ObservationMeeting = {
  id: string; sectionId: string; date: string; startsAt: string; endsAt: string;
  timeZone: string; location?: string | null; available?: boolean; reason?: string | null;
};
export type ObservationItem = {
  id: string; observee?: UserSummary | null; observer?: UserSummary | null;
  course?: { code?: string; title?: string; name?: string } | string | null;
  section?: { course?: { code?: string; title?: string; name?: string } | null } | null;
  status?: string | null; assessmentStatus?: string | null;
  scheduledMeeting?: ObservationMeeting | null;
};
export type ObservationDetail = {
  observation: ObservationItem;
  proposedMeetings?: ObservationMeeting[];
  progress?: Array<{ key: string; label: string; state: string; completedAt?: string | null }>;
  pendingAlert?: { id: string } | null; templateVersionId?: string | null;
};
export type AssignedObservationTemplate = {
  id: string; title: string;
  criteria: Array<{ id: string; key: string; prompt: string; type: string; required: boolean; order: number;
    options?: Array<{ value: number; label: string }>; weight?: number }>;
  commentPrompts: Array<{ id?: string; prompt: string; required: boolean; order: number }>;
  signatureLabels: { observer: string; observee: string };
};
export type ObservationAssessment = {
  id: string; observationId: string; templateVersionId?: string; status: string; revision: number | null;
  answers: Array<{ criterionId: string; value: number | string | null }>;
  comments: Array<{ promptId: string; text: string }>;
  generalComments?: string | null;
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
export type TemplateCriterion = { id?: string; key: string; prompt: string; type: "rating" | "text"; required: boolean; order: number; options?: Array<{ value: number; label: string }>; weight?: number };
export type TemplateComment = { id?: string; prompt: string; required: boolean; order: number };
export type ObservationTemplateWrite = {
  title: string;
  criteria: TemplateCriterion[];
  commentPrompts: TemplateComment[];
  signatureLabels: { observer: string; observee: string };
};
export type TemplateSummary = { id: string; title: string; status: "draft" | "published"; publishedAt: string | null; revision: number };
export type ObservationTemplate = ObservationTemplateWrite & TemplateSummary;

export class ApiRequestError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
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
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const code = typeof body?.error?.code === "string" ? body.error.code : undefined;
    // Only show expected, structured contract messages; never echo server exceptions.
    const detail = response.status < 500 && typeof body?.error?.message === "string" ? body.error.message : undefined;
    throw new ApiRequestError(detail || `Request failed with status ${response.status}.`, response.status, code);
  }
  return response.json() as Promise<T>;
}

const cyclePath = (cycleId: string) => `/api/evaluation-cycles/${encodeURIComponent(cycleId)}`;

// Keep array-based page components, but unwrap the contract envelope and follow
// every cursor so filters and "all semesters" do not silently omit later pages.
async function requestList<T>(path: string, paginated = true): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let nextPath = path;
  while (true) {
    const page = await requestJson<Page<T>>(nextPath);
    if (!paginated && page && Array.isArray(page.items) && page.pageInfo === undefined) return page.items;
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

export type AlertResource = { createdBy?:{id:string;name:string}|null; id:string; observationId:string; cycleId:string; type:string; status:string; reasonCode:string; reason:string; details:string; revision:number; createdAt:string; resolutionNote:string|null; allowedActions:string[]; context:{ observee:{name:string}; observer:{name:string}|null; section:{course:string;sectionNumber:string;semester:{name:string}}; observationStatus:string; candidates:{id:string;name:string;status:string}[] } };
export const acApi = {
  createObservationAlert: (id:string,body:{reasonCode:string;reason?:string;details:string}) => requestJson<AlertResource>(`/api/observations/${encodeURIComponent(id)}/alerts`,{method:"POST",body:JSON.stringify(body)}),
  getAlert: (id:string) => requestJson<AlertResource>(`/api/alerts/${encodeURIComponent(id)}`),
  getCycleAlerts: (cycleId:string) => requestList<AlertResource>(`/api/evaluation-cycles/${encodeURIComponent(cycleId)}/alerts`),
  updateAlert: (id:string,body:{status:"acknowledged"|"resolved";expectedRevision:number;resolutionNote?:string}) => requestJson<AlertResource>(`/api/alerts/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(body)}),
  sendReminders: (cycleId:string,body:{kind:string;recipientFilter:Record<string,unknown>;channels:string[];message:string},key:string) => requestJson<{recipientCount:number;notificationCount:number;emailQueuedCount:number;status:string}>(`/api/evaluation-cycles/${encodeURIComponent(cycleId)}/notifications`,{method:"POST",headers:{"Idempotency-Key":key},body:JSON.stringify(body)}),
  getEvaluationCycles: (filters: { semesterId?: string; status?: string } = {}) => requestList<Cycle>(`/api/evaluation-cycles${queryString(filters)}`),
  getEvaluationCycle: (cycleId: string) => requestJson<Cycle>(cyclePath(cycleId)),
  getSemesters: () => requestList<Semester>("/api/semesters"),
  getReports: (cycleId: string, filters: { departmentId?: string; hiringLevelId?: string } = {}) => requestJson<ReportsResponse>(`${cyclePath(cycleId)}/reports${queryString(filters)}`),
  getFacultyStatus: (cycleId: string, filters: { hiringLevelId?: string; evaluationStatus?: string } = {}) => requestList<FacultyStatusItem>(`${cyclePath(cycleId)}/faculty-status${queryString(filters)}`),
  getAttention: (cycleId: string, filters: { issue?: string; departmentId?: string } = {}) => requestList<AttentionItem>(`${cyclePath(cycleId)}/attention${queryString(filters)}`),
  getObservations: (cycleId: string, filters: { status?: string; assessmentStatus?: string } = {}) => requestList<ObservationItem>(`${cyclePath(cycleId)}/observations${queryString(filters)}`),
  getMetrics: (cycleId: string, filters: { departmentId?: string } = {}) => requestJson<MetricsResponse>(`${cyclePath(cycleId)}/metrics${queryString(filters)}`),
  getObservation: (observationId: string) => requestJson<ObservationDetail>(`/api/observations/${encodeURIComponent(observationId)}`),
  getObservationTemplate: (observationId: string) => requestJson<AssignedObservationTemplate>(`/api/observations/${encodeURIComponent(observationId)}/template`),
  getObservationAssessment: (observationId: string) => requestJson<ObservationAssessmentResponse>(`/api/observations/${encodeURIComponent(observationId)}/assessment`),
  getHiringLevels: () => requestList<HiringLevel>("/api/hiring-levels", false),
  createCycle: (body: CycleWrite) => requestJson<Cycle>("/api/evaluation-cycles", { method: "POST", body: JSON.stringify(body) }),
  updateCycle: (cycleId: string, body: Partial<Omit<CycleWrite, "semesterId">> & { expectedRevision: number }) => requestJson<Cycle>(cyclePath(cycleId), { method: "PATCH", body: JSON.stringify(body) }),
  updateCycleSettings: (cycleId: string, body: {
    expectedCycleRevision: number; expectedSemesterRevision: number;
    semester: { startsOn: string; endsOn: string; timeZone?: string };
    deadlines: { signupDeadline: string; observationDeadline: string; feedbackDeadline: string };
  }) => requestJson<{ semester: Cycle["semester"]; cycle: Cycle }>(`${cyclePath(cycleId)}/settings`, { method: "PUT", body: JSON.stringify(body) }),
  getCurrentTemplate: () => requestJson<ObservationTemplate>("/api/observation-templates/current"),
  getTemplates: () => requestList<TemplateSummary>("/api/observation-templates"),
  getTemplate: (templateId: string) => requestJson<ObservationTemplate>(`/api/observation-templates/${encodeURIComponent(templateId)}`),
  createTemplate: (body: ObservationTemplateWrite & { creationKey?: string }) => requestJson<ObservationTemplate>("/api/observation-templates", { method: "POST", body: JSON.stringify(body) }),
  updateTemplate: (templateId: string, body: ObservationTemplateWrite & { expectedRevision: number }) => requestJson<ObservationTemplate>(`/api/observation-templates/${encodeURIComponent(templateId)}`, { method: "PATCH", body: JSON.stringify(body) }),
  publishTemplate: (templateId: string, expectedRevision: number) => requestJson<ObservationTemplate>(`/api/observation-templates/${encodeURIComponent(templateId)}/publish`, { method: "POST", body: JSON.stringify({ expectedRevision }) }),
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
