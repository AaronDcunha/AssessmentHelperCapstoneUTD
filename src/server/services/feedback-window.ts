type FeedbackObservation = {
  cycle: { observationDeadline: Date; feedbackDeadline: Date };
  signedAssessment: { isLocked: boolean; observerSignedAt: Date | null; observeeSignedAt: Date | null } | null;
};

export function feedbackWindowOpen({ cycle, signedAssessment }: FeedbackObservation, now: Date) {
  const finalized = signedAssessment?.isLocked && signedAssessment.observerSignedAt && signedAssessment.observeeSignedAt;
  return now <= cycle.feedbackDeadline && (Boolean(finalized) || now > cycle.observationDeadline);
}
