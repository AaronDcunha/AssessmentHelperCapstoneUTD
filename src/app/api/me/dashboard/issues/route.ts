import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { reportFacultyIssue } from "@/server/services/faculty-participation";
export async function POST(request: Request) { return facultyActionResponse(request, reportFacultyIssue); }
