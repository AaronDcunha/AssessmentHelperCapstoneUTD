import "server-only";
import { requirePermission } from "../permissions";
import { getFacultyWorkflow } from "./faculty-workflow";
import { getPrisma } from "../prisma";
import { getFacultyCycleContext } from "./faculty-dashboard";
import { getFacultyRequests } from "./faculty-links";

/** Authentication redirects remain outside the dependency-error fallback. */
export async function facultyPageData() {
  const user = await requirePermission("profile.read.own");
  try {
    return { data: await getFacultyWorkflow(user), name: user.name };
  } catch (error) {
    console.error("Faculty workflow load failed", { code: (error as { code?: string }).code ?? "UNKNOWN" });
    return { data: null, name: user.name };
  }
}

export async function facultyRequestsPageData() {
  const user = await requirePermission("profile.read.own");
  const canRead = user.permissions.includes("observations.read.own");
  const empty = { dashboard: { availableCycles: [], cycle: null, access: { observations: canRead } }, links: null };
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(user.id)) return empty;
  try {
    const db = getPrisma();
    const profile = await db.professor.findUnique({ where: { userId: user.id }, select: { professorId: true } });
    if (!profile) return empty;
    const now = new Date();
    const { cycle, availableCycles } = await getFacultyCycleContext(db, user, now);
    const requests = cycle && canRead ? await getFacultyRequests(user, cycle.id, now, db) : [];
    return {
      dashboard: { availableCycles, cycle: cycle && { id: cycle.id, timeZone: cycle.timeZone }, access: { observations: canRead } },
      links: { requests, allowedActions: {
        respond: user.permissions.includes("invitations.respond.own"),
        lateAcceptance: user.permissions.includes("late-acceptance.request.own"),
      } },
    };
  } catch (error) {
    console.error("Faculty requests load failed", { code: (error as { code?: string }).code ?? "UNKNOWN" });
    return null;
  }
}

export type FacultyRequestsPageData = Awaited<ReturnType<typeof facultyRequestsPageData>>;
