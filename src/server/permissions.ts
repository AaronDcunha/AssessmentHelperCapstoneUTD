import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { canAccess, demoEnabled, resolveDemoUser, type TestPermission } from "./demo-auth";

export async function getCurrentUser() {
  if (!demoEnabled()) return null;
  const session = await auth();
  const id = session?.user?.id;
  if (!id?.startsWith("demo:")) return null;
  return resolveDemoUser(id.slice("demo:".length));
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(permission: TestPermission) {
  const user = await requireUser();
  if (!canAccess(user, permission)) redirect("/forbidden");
  return user;
}

export async function checkApiPermission(permission: TestPermission) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canAccess(user, permission)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return user;
}
