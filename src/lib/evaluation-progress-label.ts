const labels: Record<string, string> = { due: "Due", overdue: "Overdue", notDue: "Not due", unknown: "Unknown", ineligible: "Ineligible" };

/** Display progress without changing the evaluation requirement or eligibility. */
export function evaluationProgressLabel(status: string | undefined, signedUp: boolean, semesterId?: string, completedSemesterId?: string) {
  if (semesterId && completedSemesterId === semesterId) return "Completed";
  if (signedUp) return "Signed up";
  return status ? labels[status] ?? "Unavailable" : "Unavailable";
}
