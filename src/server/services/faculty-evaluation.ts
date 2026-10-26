export type EvaluationStatus = "due" | "overdue" | "notDue" | "unknown";

function termIndex(code: string | null): number | null {
  const match = code && /^(\d{2})([suf])$/.exec(code);
  if (!match) return null;
  return (2000 + Number(match[1])) * 3 + { s: 0, u: 1, f: 2 }[match[2] as "s" | "u" | "f"];
}

/** Provisional display rule only; this does not authorize signup or determine first-semester eligibility. */
export function facultyEvaluationStatus(currentTerm: string | null, completedTerm: string | null, intervalYears: number | null): { status: EvaluationStatus; reason: string } {
  const current = termIndex(currentTerm);
  const previous = termIndex(completedTerm);
  if (current === null) return { status: "unknown", reason: "No current evaluation cycle is available." };
  if (previous === null) return { status: "unknown", reason: "No completed evaluation history is available; eligibility requires review." };
  if (!Number.isInteger(intervalYears) || intervalYears === null || intervalYears <= 0) {
    return { status: "unknown", reason: "The hiring level has no valid evaluation interval." };
  }
  if (previous > current) return { status: "unknown", reason: "The completed evaluation semester is later than the current cycle." };
  const due = previous + intervalYears * 3;
  if (current > due) return { status: "overdue", reason: "The evaluation interval ended in an earlier semester." };
  if (current === due) return { status: "due", reason: "Your evaluation interval ends this semester." };
  return { status: "notDue", reason: "Your evaluation interval has not ended." };
}
