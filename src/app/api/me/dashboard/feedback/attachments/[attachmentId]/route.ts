import { getCurrentUser } from "@/server/permissions";
import { readFacultyAttachment } from "@/server/services/faculty-attachments";
import { FacultyActionError } from "@/server/services/faculty-actions";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401, headers });
    const { attachmentId } = await context.params, attachment = await readFacultyAttachment(user, attachmentId);
    return new Response(new Uint8Array(attachment.bytes), { headers: { ...headers, "Content-Type": attachment.contentType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}` } });
  } catch (error) { return Response.json({ error: error instanceof FacultyActionError ? error.message : "Attachment unavailable." }, { status: error instanceof FacultyActionError ? error.status : 503, headers }); }
}
