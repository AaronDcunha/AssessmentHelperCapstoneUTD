/** Browser-side reads from the team's proposed observation endpoints.
 * Authorization and record ownership must be enforced by the backend.
 * Responses remain unknown until #39's response contract is agreed and validated.
 */
export type ObservationParticipation = "observee" | "observer";

export interface ObservationFilters {
  cycleId?: string;
  semesterId?: string;
  participation?: ObservationParticipation;
  // Status values have not been agreed; do not invent an enum here.
  status?: string;
  assessmentStatus?: string;
  cursor?: string;
  limit?: number;
}

export interface ObservationReadOptions {
  signal?: AbortSignal;
}

export class ObservationApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    const message =
      status === 401
        ? "Sign in to view observations."
        : status === 403
          ? "You do not have permission to view these observations."
          : status === 404
            ? "The requested observation resource is unavailable."
            : "Observations could not be loaded. Please try again.";
    super(message);
    this.name = "ObservationApiError";
    this.status = status;
  }
}

async function readObservationResource(
  path: string,
  { signal }: ObservationReadOptions,
): Promise<unknown> {
  const response = await fetch(path, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });

  // Never pass raw backend error bodies or private record details to the UI.
  if (!response.ok) throw new ObservationApiError(response.status);

  try {
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("The observation service returned an unreadable response.");
  }
}

export function getMyObservations(
  filters: ObservationFilters = {},
  options: ObservationReadOptions = {},
): Promise<unknown> {
  const params = new URLSearchParams();
  if (filters.cycleId) params.set("cycleId", filters.cycleId);
  if (filters.semesterId) params.set("semesterId", filters.semesterId);
  if (filters.participation) params.set("participation", filters.participation);
  if (filters.status) params.set("status", filters.status);
  if (filters.assessmentStatus) params.set("assessmentStatus", filters.assessmentStatus);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.limit !== undefined) params.set("limit", String(filters.limit));
  const query = params.toString();
  return readObservationResource(`/api/me/observations${query ? `?${query}` : ""}`, options);
}

/** History's local filters must see the entire authorized result, not one page. */
export async function getMyObservationHistory(
  options: ObservationReadOptions = {},
): Promise<unknown> {
  const items: unknown[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const response = await getMyObservations({ limit: 100, cursor }, options);
    if (!response || typeof response !== "object") throw new Error("Invalid observation list.");
    const payload = response as {
      items?: unknown;
      pageInfo?: { hasMore?: unknown; nextCursor?: unknown };
    };
    if (!Array.isArray(payload.items) || typeof payload.pageInfo?.hasMore !== "boolean")
      throw new Error("Invalid observation list.");
    items.push(...payload.items);
    if (!payload.pageInfo.hasMore) {
      if (payload.pageInfo.nextCursor !== null) throw new Error("Invalid observation cursor.");
      return { items, pageInfo: { hasMore: false, nextCursor: null } };
    }
    const next = payload.pageInfo.nextCursor;
    if (!payload.items.length || typeof next !== "string" || !next.trim() || cursors.has(next))
      throw new Error("Invalid observation cursor.");
    cursors.add(next);
    cursor = next;
  }
  throw new Error("Observation history exceeds the supported page limit.");
}

export async function getObservation(
  observationId: string,
  options: ObservationReadOptions = {},
): Promise<unknown> {
  assertObservationId(observationId);
  return readObservationResource(`/api/observations/${encodeURIComponent(observationId)}`, options);
}

function assertObservationId(id: string) {
  if (!id.trim() || id === "." || id === "..") {
    throw new TypeError("A valid observation ID is required.");
  }
}

/** Read-only proposed V2 contract. These routes belong to the backend task;
 * no signed-document upload or new authentication implementation is introduced.
 */
export async function getObservationFormResources(
  observationId: string,
  options: ObservationReadOptions = {},
): Promise<{ assessment: unknown; template: unknown }> {
  assertObservationId(observationId);
  const base = `/api/observations/${encodeURIComponent(observationId)}`;
  const [assessment, template] = await Promise.all([
    readObservationResource(`${base}/assessment`, options),
    readObservationResource(`${base}/template`, options),
  ]);
  return { assessment, template };
}
