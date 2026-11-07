type ReviewState = {
  status: string;
  attempt: {
    attemptId: string; status: string; expiresAt: Date; respondedAt?: Date | null; cancelledAt?: Date | null;
    candidate: {
      status: string; respondedAt?: Date | null; cancelledAt?: Date | null; recommendationListId: string;
      attempts: { attemptId: string }[];
      observation: {
        observerId?: string | null; completedAt?: Date | null; signedAssessment?: unknown;
        status: string; currentReleasedListId: string | null; currentReleasedList: { publishedAt: Date | null } | null;
        cycle: { observationDeadline: Date };
      };
    };
  };
};

/** Persisted decisions remain decisions even when their old attempt is superseded.
 * Reads and Serializable decisions share these guards; UI labels never authorize a write.
 */
export function lateAcceptanceState(request: ReviewState, now: Date) {
  if (request.status !== "PENDING") return { actionable: false, reasonCode: "DECIDED", reason: "This request has already been decided." };
  const attempt = request.attempt, candidate = attempt.candidate, observation = candidate.observation;
  const blocked = (reasonCode: string, reason: string) => ({ actionable: false, reasonCode, reason });
  if (observation.observerId) return blocked("OBSERVER_CONFIRMED", "An observer has already been confirmed.");
  if (observation.cycle.observationDeadline <= now) return blocked("DEADLINE_PASSED", "The observation deadline has passed.");
  if (observation.completedAt || observation.signedAssessment || ["COMPLETED", "CANCELLED", "CANCELED", "NOT_OCCURRED"].includes(observation.status.toUpperCase())) return blocked("OBSERVATION_CLOSED", "The observation is closed or assessment work has started.");
  if (candidate.cancelledAt || attempt.cancelledAt || !observation.currentReleasedList?.publishedAt || candidate.recommendationListId !== observation.currentReleasedListId || candidate.attempts[0]?.attemptId !== attempt.attemptId) return blocked("SUPERSEDED", "This invitation was replaced or cancelled. Review the latest invitation.");
  if (attempt.respondedAt || candidate.respondedAt || !["PENDING", "EXPIRED"].includes(attempt.status) || !["PENDING", "EXPIRED"].includes(candidate.status)) return blocked("ANSWERED", "The invitation has already been answered or closed.");
  if (attempt.expiresAt > now) return blocked("NOT_EXPIRED", "The invitation response window has not expired.");
  return { actionable: true, reasonCode: null, reason: null };
}
