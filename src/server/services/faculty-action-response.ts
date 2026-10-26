import "server-only";
import type { AccountUser } from "../account-auth";
import { getCurrentUser } from "../permissions";
import { FacultyActionError } from "./faculty-actions";

export function facultyOriginAllowed(request: Request) {
  const expected = new URL(request.url);
  expected.host = request.headers.get("host") ?? expected.host;
  const protocol = request.headers.get("x-forwarded-proto");
  if (protocol === "http" || protocol === "https") expected.protocol = `${protocol}:`;
  return request.headers.get("origin") === expected.origin && request.headers.get("sec-fetch-site") !== "cross-site";
}
export async function facultyRequestBytes(request: Request, limit = 262144) {
  if (Number(request.headers.get("content-length")) > limit) throw new FacultyActionError("Request body is too large.", 413);
  const reader = request.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
  if (reader) try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.length;
      if (size > limit) { await reader.cancel(); throw new FacultyActionError("Request body is too large.", 413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

export async function facultyActionResponse(request: Request, action: (user: AccountUser, body: unknown) => Promise<unknown>) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401, headers });
    // Next may construct request.url with its internal hostname. Validate against
    // the actual HTTP Host, preserving the port and requiring the request scheme.
    if (!facultyOriginAllowed(request)) return Response.json({ error: "A same-origin request is required." }, { status: 403, headers });
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return Response.json({ error: "Send a JSON request." }, { status: 415, headers });
    let body: unknown;
    const bytes = await facultyRequestBytes(request);
    try { body = JSON.parse(bytes.toString("utf8")); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400, headers }); }
    return Response.json(await action(user, body), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof FacultyActionError ? error.message : "The action could not be completed. Please try again." },
      { status: error instanceof FacultyActionError ? error.status : 503, headers });
  }
}
