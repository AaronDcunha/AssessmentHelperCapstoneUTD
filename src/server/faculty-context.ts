import "server-only";
import { cookies } from "next/headers";

export async function selectedFacultyCycle() {
  // Services may also be called outside a request (isolated tests/jobs).
  try { return (await cookies()).get("faculty-cycle")?.value ?? null; }
  catch { return null; }
}
export async function selectedFacultyObservation() {
  try { return (await cookies()).get("faculty-observation")?.value ?? null; }
  catch { return null; }
}
