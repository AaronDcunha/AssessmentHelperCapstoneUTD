import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { releaseRecommendations } from "@/server/services/faculty-invitations";
export async function POST(request: Request, context: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await context.params;
  return facultyActionResponse(request, (user, body) => releaseRecommendations(user, cycleId, body));
}
