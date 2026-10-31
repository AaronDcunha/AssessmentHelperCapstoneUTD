import { checkApiPermission } from "@/server/permissions";
import { getPrisma } from "@/server/prisma";
import { ConfigurationError } from "@/server/configuration-validation";
import { getObservationCandidates } from "@/server/queries/observation-candidates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, context: { params: Promise<{ observationId: string }> }) {
  try {
    const user = await checkApiPermission("observations.read");
    if (user instanceof Response) {
      return Response.json({ error: {
        code: user.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
        message: user.status === 401 ? "Sign in to review observer candidates." : "Access denied.",
      } }, { status: user.status, headers });
    }
    const { observationId } = await context.params;
    const data = await getPrisma().$transaction(
      db => getObservationCandidates(db, user, observationId, new URL(request.url)),
      { isolationLevel: "RepeatableRead", timeout: 20000 },
    );
    return Response.json(data, { headers });
  } catch (error) {
    const failure = error instanceof ConfigurationError ? error
      : new ConfigurationError(503, "UNAVAILABLE", "Observer candidates could not be loaded. Please try again later.");
    return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status, headers });
  }
}
