import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { declineFacultyInvitation } from "@/server/services/faculty-invitations";

export async function POST(request: Request) { return facultyActionResponse(request, declineFacultyInvitation); }
