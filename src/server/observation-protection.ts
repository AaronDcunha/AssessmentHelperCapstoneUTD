export function protectedObservation(record: { status: string; completedAt: Date | null; signedAssessment: { observerSignedAt: Date | null; observeeSignedAt: Date | null; isLocked: boolean; completedAt: Date | null } | null }) {
  const signed = record.signedAssessment;
  return Boolean(record.completedAt || signed?.observerSignedAt || signed?.observeeSignedAt || signed?.isLocked || signed?.completedAt
    || ["COMPLETED", "CLOSED", "NOT_OCCURRED"].includes(record.status.toUpperCase()));
}
