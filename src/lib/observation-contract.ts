/** Aaron's observation read DTO. Haris's schema has no revision or separate
 * assessment lifecycle; unavailable draft fields stay null instead of guessed.
 * section.semester is an additive lookup for history labels (Semester.termName).
 */
export interface ObservationRead {
  id: string;
  cycleId: string;
  signupId: string;
  section: {
    id: string;
    course: { id: string; code: string; title: string; departmentId: string; level: number };
    sectionNumber: string;
    semesterId: string;
    semester: { id: string; name: string };
    meetings: never[];
  };
  observee: { id: string; name: string };
  observer: { id: string; name: string } | null;
  participation: ("observer" | "observee")[];
  status: string;
  assessmentStatus: null;
  scheduledMeeting: null;
  occurred: null;
  revision: null;
  allowedActions: string[];
}
