import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { sendFacultyInvitations } from "@/server/services/faculty-invitations";
export async function POST(request: Request) { return facultyActionResponse(request, sendFacultyInvitations); }
