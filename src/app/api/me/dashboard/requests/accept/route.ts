import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { acceptFacultyInvitation } from "@/server/services/faculty-invitations";
export async function POST(request: Request) { return facultyActionResponse(request, acceptFacultyInvitation); }
