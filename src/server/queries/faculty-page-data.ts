import "server-only";
import { requirePermission } from "../permissions";
import { getFacultyWorkflow } from "./faculty-workflow";

/** Authentication redirects remain outside the dependency-error fallback. */
export async function facultyPageData() {
  const user = await requirePermission("profile.read.own");
  try {
    return { data: await getFacultyWorkflow(user), name: user.name };
  } catch {
    return { data: null, name: user.name };
  }
}
