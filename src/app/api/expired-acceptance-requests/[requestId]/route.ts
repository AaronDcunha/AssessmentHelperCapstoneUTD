import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { reviewLateAcceptance } from "@/server/services/faculty-invitations";
export async function PATCH(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params;
  return facultyActionResponse(request, (user, body) => reviewLateAcceptance(user, requestId, body));
}
