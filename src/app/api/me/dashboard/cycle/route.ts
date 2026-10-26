import { cookies } from "next/headers";
import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { getRelevantFacultyCycles } from "@/server/queries/configuration";
import { getPrisma } from "@/server/prisma";
import { FacultyActionError } from "@/server/services/faculty-actions";
import { requireFacultyGrants, workflowId, workflowInput } from "@/server/services/faculty-invitations";

export async function POST(request: Request) {
  return facultyActionResponse(request, async (user, body) => {
    requireFacultyGrants(user, "profile.read.own");
    const input = workflowInput(body, ["cycleId"]), id = workflowId(input.cycleId);
    const cycles = await getRelevantFacultyCycles(getPrisma(), user, new Date());
    if (!cycles.some(cycle => cycle.cycleId === id)) throw new FacultyActionError("That cycle is not available to you.", 403);
    (await cookies()).set("faculty-cycle", id, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/" });
    return { message: "Cycle selected." };
  });
}
