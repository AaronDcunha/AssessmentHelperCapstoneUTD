import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { generateRecommendations } from "@/server/services/faculty-invitations";
export async function POST(request: Request, context: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await context.params;
  return facultyActionResponse(request, (user, body) => generateRecommendations(user, cycleId, body));
}
