import { monitoringHandler } from "@/server/ac-reports-api";
import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { deleteObservation } from "@/server/services/observation-lifecycle";

export const GET = monitoringHandler("details");
export async function DELETE(request: Request, context: { params: Promise<{ observationId: string }> }) {
  const { observationId } = await context.params;
  return facultyActionResponse(request, (user, body) => deleteObservation(user, observationId, body));
}
