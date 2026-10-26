import "server-only";
import type { AccountUser } from "../account-auth";
import { getCurrentUser } from "../permissions";
import { FacultyActionError } from "./faculty-actions";

export async function facultyActionResponse(request: Request, action: (user: AccountUser, body: unknown) => Promise<unknown>) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401, headers });
    // Next may construct request.url with its internal hostname. Validate against
    // the actual HTTP Host, preserving the port and requiring the request scheme.
    const expected = new URL(request.url);
    expected.host = request.headers.get("host") ?? expected.host;
    const protocol = request.headers.get("x-forwarded-proto");
    if (protocol === "http" || protocol === "https") expected.protocol = `${protocol}:`;
    if (request.headers.get("origin") !== expected.origin) return Response.json({ error: "A same-origin request is required." }, { status: 403, headers });
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return Response.json({ error: "Send a JSON request." }, { status: 415, headers });
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400, headers }); }
    return Response.json(await action(user, body), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof FacultyActionError ? error.message : "The action could not be completed. Please try again." },
      { status: error instanceof FacultyActionError ? error.status : 503, headers });
  }
}
