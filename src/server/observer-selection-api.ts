import { getCurrentUser } from "./permissions";
import { getPrisma } from "./prisma";
import { ConfigurationError } from "./configuration-validation";
import { FacultyActionError } from "./services/faculty-errors";
import { getObserverCandidates, getObserverSelectionSignups } from "./queries/observer-selection";

type Operation = "signups" | "candidates";

export function observerSelectionHandler(operation: Operation) {
  return async (request: Request, context: { params: Promise<Record<string, string>> }) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw new ConfigurationError(401, "UNAUTHENTICATED", "Sign in to access observer selection.");
      const required = operation === "signups" ? "signups.read" : "observations.read";
      if (!user.permissions.includes(required)) throw new ConfigurationError(403, "FORBIDDEN", "Permission denied.");
      const params = await context.params;
      const data = operation === "signups"
        ? await getPrisma().$transaction(db => getObserverSelectionSignups(db, params.cycleId, new URL(request.url)))
        : await getPrisma().$transaction(db => getObserverCandidates(db, params.observationId));
      return Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      const failure = error instanceof ConfigurationError ? error
        : error instanceof FacultyActionError ? new ConfigurationError(error.status, "OBSERVER_SELECTION_ERROR", error.message)
        : new ConfigurationError(500, "INTERNAL_ERROR", "Unable to load observer-selection data.");
      if (!(error instanceof ConfigurationError) && !(error instanceof FacultyActionError)) console.error("Observer-selection read failed.");
      return Response.json({ error: { code: failure.code, message: failure.message } },
        { status: failure.status, headers: { "Cache-Control": "private, no-store" } });
    }
  };
}
