import { checkApiPermission } from "@/server/permissions";
import {
  getDemoObservationHistory,
  ObservationQueryError,
  queryPersonalObservations,
} from "@/server/queries/demo-observation-history";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/** Personal observation reads: shared dashboard/history endpoint from Draft V2. */
export async function GET(request: Request) {
  const user = await checkApiPermission("observations.read.own");
  if (user instanceof Response) {
    return Response.json(
      {
        error: {
          code: user.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN",
          message: user.status === 401 ? "Sign in to view observations." : "Access denied.",
        },
      },
      { status: user.status, headers },
    );
  }
  if (process.env.NODE_ENV !== "development" || process.env.AUTH_DEMO_ENABLED !== "true") {
    return Response.json(
      {
        error: {
          code: "UNAVAILABLE",
          message: "The temporary observation data provider is disabled.",
        },
      },
      { status: 503, headers },
    );
  }
  try {
    return Response.json(
      queryPersonalObservations(getDemoObservationHistory(user), new URL(request.url).searchParams),
      { headers },
    );
  } catch (error) {
    if (error instanceof ObservationQueryError)
      return Response.json(
        { error: { code: "INVALID_QUERY", message: error.message } },
        { status: 400, headers },
      );
    throw error;
  }
}
