import { facultyActionResponse } from "@/server/services/faculty-action-response";
import { declineFacultyRequest } from "@/server/services/faculty-actions";

export async function POST(request: Request) { return facultyActionResponse(request, declineFacultyRequest); }
