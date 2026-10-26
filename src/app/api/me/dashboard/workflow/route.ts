import { getCurrentUser } from "@/server/permissions";
import { DashboardForbidden } from "@/server/queries/faculty-dashboard";
import { getFacultyWorkflow } from "@/server/queries/faculty-workflow";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401, headers });
    return Response.json(await getFacultyWorkflow(user), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof DashboardForbidden ? "Forbidden" : "Faculty data is temporarily unavailable." }, { status: error instanceof DashboardForbidden ? 403 : 503, headers });
  }
}
