"use client";

export async function postFacultyAction<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/me/dashboard/${path}`, { method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "The action could not be completed.");
  return result as T;
}
