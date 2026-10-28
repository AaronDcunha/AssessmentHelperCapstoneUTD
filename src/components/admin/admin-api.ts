export type Revision = string | number;
export type FieldErrors = Record<string, string>;
export const isRevision = (v: unknown): v is Revision => (typeof v === "string" && v.trim().length > 0)
  || (typeof v === "number" && Number.isSafeInteger(v) && v >= 0);

export class AdminApiError extends Error {
  constructor(message: string, public status = 0, public fieldErrors: FieldErrors = {}, public uncertain = false) {
    super(message);
    this.name = "AdminApiError";
  }
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Shared Admin transport. Backend enforces origin/CSRF, session and effective permissions. */
export async function requestAdminJson(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
  const mutation = method !== "GET";
  let response: Response;
  try {
    response = await fetch(path, {
      method, signal, credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new AdminApiError(mutation ? "The connection failed. The operation may have completed; verify the record before trying again."
      : "Unable to connect to the service. Please try again.", 0, {}, mutation);
  }
  const json = /application\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get("content-type") ?? "");
  let data: unknown;
  if (json && !response.redirected) {
    try { data = await response.json(); } catch (error) { if (signal?.aborted) throw error; }
  }
  if (!response.ok) {
    const errors: FieldErrors = {};
    if (object(data) && object(data.error) && object(data.error.fieldErrors)) {
      for (const [key, value] of Object.entries(data.error.fieldErrors)) {
        if (typeof value === "string") errors[key] = value;
        else if (Array.isArray(value) && value.every(v => typeof v === "string")) errors[key] = value.join(" ");
      }
    }
    const messages: Record<number, string> = {
      400: "The request was rejected. Check the fields below.",
      401: "Your session has expired or the account is inactive. Sign in again.",
      403: "You do not have permission to perform this operation.",
      404: "The record or API endpoint is unavailable.",
      409: "The operation conflicts with the current record. Reload the latest data and review your changes before retrying an edit.",
      422: "Some fields were rejected. Review your changes and try again.",
    };
    throw new AdminApiError(messages[response.status] ?? "The service could not complete the request. Please try again.",
      response.status, errors, mutation && response.status >= 500);
  }
  if (method === "DELETE" && response.status === 204 && !response.redirected) return null;
  if (response.redirected || !json || data === undefined) {
    throw new AdminApiError(mutation ? "The service returned an unexpected response. The operation may have completed; verify the record before retrying."
      : "The API is unavailable or returned an unexpected response.", response.status, {}, mutation);
  }
  return data;
}
