import { getCurrentUser } from "./permissions";
import { getPrisma } from "./prisma";
import { ConfigurationError } from "./configuration-validation";
import { getCycleReport, getObservation, type ReportView, type ObservationView } from "./queries/ac-reports";

type Operation = ReportView | ObservationView;
export function monitoringHandler(operation: Operation) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw new ConfigurationError(401, "UNAUTHENTICATED", "Sign in to access observations.");
      const params = await context.params, db = getPrisma();
      const data = params.cycleId ? await getCycleReport(db, user, new URL(request.url), params.cycleId, operation as ReportView)
        : await getObservation(db, user, params.observationId, operation as ObservationView);
      return Response.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const failure = error instanceof ConfigurationError ? error : new ConfigurationError(500, "INTERNAL_ERROR", "Unable to load monitoring data.");
      if (!(error instanceof ConfigurationError)) console.error("Monitoring request failed.");
      return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status, headers: { "Cache-Control": "no-store" } });
    }
  };
}
