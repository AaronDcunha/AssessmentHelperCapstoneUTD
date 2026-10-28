import { checkApiPermission } from "@/server/permissions";
import { getPrisma } from "@/server/prisma";
import { ConfigurationError } from "@/server/configuration-validation";
import { getPersonalObservations } from "@/server/queries/personal-observations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const user = await checkApiPermission("observations.read.own");
    if (user instanceof Response) {
      return Response.json({ error: {
        code: user.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
        message: user.status === 401 ? "Sign in to view observations." : "Access denied.",
      } }, { status: user.status, headers });
    }
    const data = await getPersonalObservations(getPrisma(), user, new URL(request.url).searchParams);
    return Response.json(data, { headers });
  } catch (error) {
    const failure = error instanceof ConfigurationError ? error
      : new ConfigurationError(503, "UNAVAILABLE", "Observations could not be loaded. Please try again later.");
    return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status, headers });
  }
}
