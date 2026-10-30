import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { regenerateRecommendations } from "@/server/services/faculty-invitations";

export async function POST(request: Request, context: { params: Promise<{ observationId: string }> }) {
  const { observationId } = await context.params;
  return facultyActionResponse(request, (user, body) => regenerateRecommendations(user, observationId, body));
}
