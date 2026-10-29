import { FacultyAssessmentScreen } from "@/components/observations/faculty-assessment-screen";
import { requirePermission } from "@/server/permissions";
import { getFacultyAssessment, type FacultyAssessment } from "@/server/queries/faculty-assessment";

export default async function Page() {
  const user = await requirePermission("assessment.read.own");
  let initial: FacultyAssessment | null = null;
  let unavailable = false;
  try { initial = await getFacultyAssessment(user); }
  catch { unavailable = true; }
  return <FacultyAssessmentScreen initial={initial} unavailable={unavailable} />;
}

