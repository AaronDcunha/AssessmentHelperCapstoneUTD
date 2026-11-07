import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { deleteSignup } from "@/server/services/observation-lifecycle";

export async function DELETE(request: Request, context: { params: Promise<{ signupId: string }> }) {
  const { signupId } = await context.params;
  return facultyActionResponse(request, (user, body) => deleteSignup(user, signupId, body));
}
