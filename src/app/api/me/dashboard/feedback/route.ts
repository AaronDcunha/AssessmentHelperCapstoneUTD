import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { submitFacultyFeedback } from "@/server/services/faculty-participation";
export async function POST(request: Request) { return facultyActionResponse(request, submitFacultyFeedback); }
