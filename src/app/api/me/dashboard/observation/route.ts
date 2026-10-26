import { cookies } from "next/headers";
import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { getFacultyDashboard } from "@/server/queries/faculty-dashboard";
import { FacultyActionError } from "@/server/services/faculty-actions";
import { workflowId, workflowInput } from "@/server/services/faculty-invitations";
export async function POST(request: Request) {
  return facultyActionResponse(request, async (user, body) => {
    const id = workflowId(workflowInput(body, ["observationId"]).observationId);
    const dashboard = await getFacultyDashboard(user);
    if (!dashboard.availableObservations.some(record => record.id === id)) throw new FacultyActionError("That active observation is not available to you.", 403);
    (await cookies()).set("faculty-observation", id, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/" });
    return { message: "Observation selected." };
  });
}
