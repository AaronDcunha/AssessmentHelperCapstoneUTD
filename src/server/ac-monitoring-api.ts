import { getCurrentUser } from "./permissions";
import { getPrisma } from "./prisma";
import { ConfigurationError } from "./configuration-validation";
import {
  getAttention, getCandidates, getFacultyStatus, getMetrics, getObservation,
  getObservationAssessment, getObservations, getObservationTemplate, getReports, getSignups,
} from "./queries/ac-monitoring";

export type AcReadOperation = "reports" | "faculty-status" | "attention" | "observations" | "metrics" |
  "signups" | "observation" | "candidates" | "observation-template" | "observation-assessment";

const permission: Record<AcReadOperation, string> = {
  reports: "reports.read", "faculty-status": "reports.read", attention: "reports.read",
  observations: "observations.read", metrics: "metrics.read", signups: "signups.read",
  observation: "observations.read", candidates: "observations.read",
  "observation-template": "assessments.read", "observation-assessment": "assessments.read",
};

export function acReadHandler(operation: AcReadOperation) {
  return async (request: Request, context?: { params: Promise<Record<string, string>> }) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw new ConfigurationError(401, "UNAUTHENTICATED", "Sign in to access AC records.");
      if (!user.permissions.includes(permission[operation])) throw new ConfigurationError(403, "FORBIDDEN", "Permission denied.");
      const params = context ? await context.params : {};
      const url = new URL(request.url);
      const db = getPrisma();
      const data = operation === "reports" ? await getReports(db, params.cycleId)
        : operation === "faculty-status" ? await getFacultyStatus(db, params.cycleId, url)
        : operation === "attention" ? await getAttention(db, params.cycleId, url)
        : operation === "observations" ? await getObservations(db, params.cycleId, url)
        : operation === "metrics" ? await getMetrics(db, params.cycleId)
        : operation === "signups" ? await getSignups(db, params.cycleId, url)
        : operation === "observation" ? await getObservation(db, params.observationId)
        : operation === "candidates" ? await getCandidates(db, params.observationId)
        : operation === "observation-template" ? await getObservationTemplate(db, params.observationId)
        : await getObservationAssessment(db, params.observationId);
      return Response.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const failure = error instanceof ConfigurationError ? error : new ConfigurationError(500, "INTERNAL_ERROR", "Unable to load AC records.");
      if (!(error instanceof ConfigurationError)) console.error("AC read request failed.");
      return Response.json({ error: { code: failure.code, message: failure.message } }, { status: failure.status, headers: { "Cache-Control": "no-store" } });
    }
  };
}
