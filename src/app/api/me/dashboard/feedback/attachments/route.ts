import { getCurrentUser } from "@/server/permissions";
import { facultyOriginAllowed, facultyRequestBytes } from "@/server/services/faculty-action-response";
import { uploadFacultyAttachment } from "@/server/services/faculty-attachments";
import { FacultyActionError } from "@/server/services/faculty-actions";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401, headers });
    if (!facultyOriginAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403, headers });
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;")) return Response.json({ error: "Send a multipart file upload." }, { status: 415, headers });
    const bytes = await facultyRequestBytes(request, 5 * 1024 * 1024 + 65536);
    let form: FormData;
    try { form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": contentType } }).formData(); }
    catch { throw new FacultyActionError("Invalid multipart data.", 400); }
    const file = form.get("file"), observationId = form.get("observationId");
    if (!(file instanceof File) || typeof observationId !== "string" || [...form.keys()].length !== 2) throw new FacultyActionError("Provide one file and an observation identifier.", 400);
    return Response.json(await uploadFacultyAttachment(user, observationId, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }), { status: 201, headers });
  } catch (error) { return Response.json({ error: error instanceof FacultyActionError ? error.message : "Upload is temporarily unavailable." }, { status: error instanceof FacultyActionError ? error.status : 503, headers }); }
}
