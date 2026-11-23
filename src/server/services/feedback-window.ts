type FeedbackObservation = {
  status: string;
  cycle: { feedbackDeadline: Date };
  signedAssessment: { isLocked: boolean; observerSignedAt: Date | null; observeeSignedAt: Date | null } | null;
};

export function feedbackReady({ status, signedAssessment }: FeedbackObservation) {
  return !["CANCELLED", "CANCELED", "NOT_OCCURRED"].includes(status.toUpperCase())
    && !!(signedAssessment?.isLocked && signedAssessment.observerSignedAt && signedAssessment.observeeSignedAt);
}

export function feedbackWindowOpen(record: FeedbackObservation, now: Date) {
  return feedbackReady(record) && now <= record.cycle.feedbackDeadline;
}

export function surveyCompletedAt(
  submissions: ReadonlyArray<{ professorId: string; feedbackRole: string; submittedAt: Date }>,
  observeeId: string,
  observerId: string | null,
) {
  const observee = submissions.find(row => row.professorId === observeeId && row.feedbackRole === "OBSERVEE");
  const observer = submissions.find(row => row.professorId === observerId && row.feedbackRole === "OBSERVER");
  if (!observee || !observer) return null;
  return observee.submittedAt > observer.submittedAt ? observee.submittedAt : observer.submittedAt;
}
