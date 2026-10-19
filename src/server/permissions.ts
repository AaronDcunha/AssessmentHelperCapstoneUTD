import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { demoEnabled, resolveDemoUser } from "./demo-auth";
import { resolveDatabaseUser } from "./database-auth";

export async function getCurrentUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  if (id.startsWith("demo:")) {
    const demo = demoEnabled() ? resolveDemoUser(id.slice("demo:".length)) : null;
    // Reserved development fixtures can reach the same faculty previews as seeded users.
    return demo ? { ...demo, permissions: [...demo.permissions, "profile.read.own", "observations.read.own"] } : null;
  }
  return resolveDatabaseUser(id);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(permission: string) {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) redirect("/forbidden");
  return user;
}

export async function checkApiPermission(permission: string) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!user.permissions.includes(permission)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return user;
}
