import { ApiRequestError, type ObservationMeeting } from "./ac-api";

export type LateAcceptanceRequest = {
  id: string; status: string; persistedStatus: string; displayStatus: string;
  requestedAt: string; decidedAt: string | null; reason: string | null;
  actionable: boolean; reasonCode: string | null; actionReason: string | null;
  requester: { id: string; name: string }; observee: { id: string; name: string };
  course: string; section: string; originalInvitationExpiresAt: string;
  observationDeadline: string; timeZone: string; proposedMeetings: ObservationMeeting[];
};
export type LateAcceptanceResponse = {
  cycle: { id: string; name: string; timeZone: string } | null;
  items: LateAcceptanceRequest[];
  summary: { pending: number; approved: number; notActionable: number; total: number };
  pageInfo: { hasMore: boolean; nextCursor: string | null };
};
export async function lateAcceptanceJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json" } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiRequestError(response.status < 500 && typeof body?.error === "string" ? body.error : "Late acceptance requests are unavailable. Please retry.", response.status);
  if (!body) throw new ApiRequestError("Invalid server response.");
  return body;
}
export async function getLateRequests(query: URLSearchParams) {
  const result = await lateAcceptanceJson<LateAcceptanceResponse>(`/api/evaluation-cycles/current/expired-acceptance-requests?${query}`);
  if (!(result.cycle === null || (typeof result.cycle?.id === "string" && typeof result.cycle?.name === "string" && typeof result.cycle?.timeZone === "string")) ||
    !Array.isArray(result.items) || typeof result.pageInfo?.hasMore !== "boolean" ||
    ![result.summary?.total, result.summary?.pending, result.summary?.approved, result.summary?.notActionable].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new ApiRequestError("Invalid late acceptance response. Please retry.");
  }
  return result;
}
export function lateStatusLabel(request: Pick<LateAcceptanceRequest, "displayStatus">) {
  const labels: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", SUPERSEDED: "Superseded", OBSERVER_CONFIRMED: "Observer confirmed", DEADLINE_PASSED: "Deadline passed", OBSERVATION_CLOSED: "Observation closed", ANSWERED: "Answered", NOT_EXPIRED: "Not expired" };
  return labels[request.displayStatus] ?? "Unavailable";
}
