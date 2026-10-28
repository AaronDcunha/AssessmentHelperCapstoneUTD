import { getCurrentUser } from "@/server/permissions";
import { getFacultyAssessment } from "@/server/queries/faculty-assessment";
import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { saveFacultyAssessment } from "@/server/services/faculty-assessment";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401, headers });
    if (!["profile.read.own", "observations.read.own", "assessment.read.own"].every(permission => user.permissions.includes(permission))) return Response.json({ error: "Forbidden" }, { status: 403, headers });
    return Response.json({ form: await getFacultyAssessment(user) }, { headers });
  } catch { return Response.json({ error: "The observation form is temporarily unavailable." }, { status: 503, headers }); }
}
export async function POST(request: Request) { return facultyActionResponse(request, saveFacultyAssessment); }
