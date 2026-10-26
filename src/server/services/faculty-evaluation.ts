export type EvaluationStatus = "due" | "overdue" | "notDue" | "unknown" | "ineligible";

function termIndex(code: string | null): number | null {
  const match = code && /^(\d{2})([suf])$/.exec(code);
  if (!match) return null;
  return (2000 + Number(match[1])) * 3 + { s: 0, u: 1, f: 2 }[match[2] as "s" | "u" | "f"];
}

/** Documented Faculty assumptions: current rank interval; first evaluation from
 * second semester; missing dates can be corroborated by a prior teaching term. */
export function facultyEligibility(cycle: { termCode: string; startsOn: string | null; endsOn: string | null } | null,
  completedTerm: string | null, interval: number | null, hireDate: Date | null, teachingTerms: string[]) {
  const status = facultyEvaluationStatus(cycle?.termCode ?? null, completedTerm, interval);
  if (!cycle || termIndex(cycle.termCode) === null || !Number.isInteger(interval) || !interval || interval < 1) return { ...status, canSignUp: false };
  const current = termIndex(cycle.termCode)!;
  const previous = termIndex(completedTerm);
  const hired = hireDate?.toISOString().slice(0, 10);
  if (hired && cycle.startsOn && hired >= cycle.startsOn) return { status: "ineligible" as const, reason: "Signup begins after your first semester of employment.", canSignUp: false };
  const established = (previous !== null && previous < current) || (hired && cycle.startsOn && hired < cycle.startsOn)
    || teachingTerms.some(code => termIndex(code) !== null && termIndex(code)! < current);
  if (previous !== null && previous > current) return { ...status, canSignUp: false };
  if (!established) return { status: "unknown" as const, reason: "A hire date or prior teaching/evaluation semester is needed to verify eligibility.", canSignUp: false };
  if (previous === null) return { status: "due" as const, reason: "No completed evaluation is recorded; established faculty are due for an initial evaluation.", canSignUp: true };
  return { ...status, canSignUp: previous < current };
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
