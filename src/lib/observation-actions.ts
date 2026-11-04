type ObservationState = {
  status: string; completedAt: Date | null; scheduledAt: Date | null;
  signedAssessment?: { isLocked: boolean; observerSignedAt: Date | null; observeeSignedAt: Date | null } | null;
};

/** Mirrors the non-occurrence write guard for participant action availability. */
export function canReportNotCompleted(record: ObservationState, now: Date) {
  return !record.completedAt && !["COMPLETED", "CANCELLED", "CANCELED", "NOT_OCCURRED"].includes(record.status.toUpperCase())
    && !!record.scheduledAt && record.scheduledAt <= now && !record.signedAssessment?.isLocked
    && !record.signedAssessment?.observerSignedAt && !record.signedAssessment?.observeeSignedAt;
}
