import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { selectFacultyObserver } from "@/server/services/faculty-invitations";
export async function POST(request: Request) { return facultyActionResponse(request, selectFacultyObserver); }
