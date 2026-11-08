import { getCurrentUser } from "@/server/permissions";
import { getPrisma } from "@/server/prisma";
import { getLateAcceptanceRequests } from "@/server/queries/late-acceptance";
import { FacultyActionError } from "@/server/services/faculty-errors";
import { ConfigurationError } from "@/server/configuration-validation";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ cycleId: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401, headers });
    if (!user.permissions.includes("late-acceptance.review")) return Response.json({ error: "Forbidden" }, { status: 403, headers });
    const { cycleId } = await context.params;
    const result = await getPrisma().$transaction(db => getLateAcceptanceRequests(db, user, cycleId, new URL(request.url)), { isolationLevel: "RepeatableRead" });
    return Response.json(result, { headers });
  } catch (error) {
    const known = error instanceof FacultyActionError || error instanceof ConfigurationError;
    return Response.json({ error: known ? error.message : "Approval requests are unavailable." }, { status: known ? error.status : 503, headers });
  }
}
