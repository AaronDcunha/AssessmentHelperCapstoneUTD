import { monitoringHandler } from "@/server/ac-reports-api";
import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { reassignObservationTemplate } from "@/server/services/observation-lifecycle";

export const GET = monitoringHandler("template");
export async function PATCH(request: Request, context: { params: Promise<{ observationId: string }> }) {
  const { observationId } = await context.params;
  return facultyActionResponse(request, (user, body) => reassignObservationTemplate(user, observationId, body));
}
