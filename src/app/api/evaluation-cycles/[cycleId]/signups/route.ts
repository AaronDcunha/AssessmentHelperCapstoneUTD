import { checkApiPermission } from "@/server/permissions";
import { getPrisma } from "@/server/prisma";
import { ConfigurationError } from "@/server/configuration-validation";
import { getCycleSignups } from "@/server/queries/cycle-signups";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, context: { params: Promise<{ cycleId: string }> }) {
  try {
    // The shared guard resolves current active database identity and effective grants.
    const user = await checkApiPermission("signups.read");
    if (user instanceof Response) {
      return Response.json({ error: {
        code: user.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
        message: user.status === 401 ? "Sign in to view cycle signups." : "Access denied.",
      } }, { status: user.status, headers });
    }
    const { cycleId } = await context.params;
    const data = await getCycleSignups(getPrisma(), user, cycleId, new URL(request.url));
    return Response.json(data, { headers });
  } catch (error) {
    const failure = error instanceof ConfigurationError ? error
      : new ConfigurationError(503, "UNAVAILABLE", "Cycle signups could not be loaded. Please try again later.");
    return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status, headers });
  }
}
