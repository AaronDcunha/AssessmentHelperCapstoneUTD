import { getCurrentUser } from "@/server/permissions";
import { DashboardForbidden, getFacultyDashboard } from "@/server/queries/faculty-dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401, headers });
    return Response.json(await getFacultyDashboard(user), { headers });
  } catch (error) {
    if (error instanceof DashboardForbidden) return Response.json({ error: "Forbidden" }, { status: 403, headers });
    // Do not return database details, credentials, or private data in error messages.
    return Response.json({ error: "Dashboard data is temporarily unavailable." }, { status: 503, headers });
  }
}
