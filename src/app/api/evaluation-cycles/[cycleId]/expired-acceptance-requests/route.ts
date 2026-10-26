import { getCurrentUser } from "@/server/permissions";
import { getPrisma } from "@/server/prisma";
import { workflowId } from "@/server/services/faculty-invitations";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ cycleId: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401, headers });
    if (!user.permissions.includes("late-acceptance.review")) return Response.json({ error: "Forbidden" }, { status: 403, headers });
    const { cycleId } = await context.params; workflowId(cycleId);
    const items = await getPrisma().lateAcceptanceApproval.findMany({ where: { attempt: { candidate: { observation: { cycleId } } } },
      include: { attempt: { include: { candidate: { include: { professor: { include: { user: { select: { fullName: true } } } } } } } } }, orderBy: { requestedAt: "desc" }, take: 100 });
    return Response.json({ items }, { headers });
  } catch { return Response.json({ error: "Approval requests are unavailable." }, { status: 503, headers }); }
}
