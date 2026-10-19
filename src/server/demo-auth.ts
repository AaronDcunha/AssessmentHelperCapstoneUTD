// Temporary server-side identities; replace with authorized database queries later.
export const testAreas = ["faculty", "ac", "admin"] as const;
export type TestArea = (typeof testAreas)[number];
export type TestPermission = `test:${TestArea}`;
export type DemoUser = {
  id: string;
  username: string;
  name: string;
  roles: TestArea[];
  permissions: TestPermission[];
};

export function demoEnabled(env = process.env) {
  return env.NODE_ENV === "development" && env.AUTH_DEMO_ENABLED === "true";
}

export function isTestArea(value: string): value is TestArea {
  return testAreas.some((area) => area === value);
}

export function resolveDemoUser(username: string): DemoUser | null {
  // Reject unknown identities here too, invalidating older fallback sessions.
  if (!isTestArea(username)) return null;
  const roles: TestArea[] = [username];
  // Assigned roles stay distinct from the permissions they inherit.
  const accessByRole: Record<TestArea, TestArea[]> = {
    faculty: ["faculty"],
    ac: ["faculty", "ac"],
    admin: ["faculty", "ac", "admin"],
  };
  const areas = [...new Set(roles.flatMap((role) => accessByRole[role]))];
  return { id: `demo:${username}`, username, name: `Demo ${username}`, roles,
    permissions: areas.map((area): TestPermission => `test:${area}`) };
}

export function authenticateDemo(credentials: Partial<Record<"username" | "password", unknown>>, env = process.env): DemoUser | null {
  if (!demoEnabled(env)) return null;
  const { username, password } = credentials;
  if (typeof username !== "string" || typeof password !== "string") return null;
  const normalized = username.trim().toLowerCase();
  if (!normalized || normalized.length > 100 || !password.trim() || password.length > 256) return null;
  if (!isTestArea(normalized) || password !== "123") return null;
  return resolveDemoUser(normalized);
}

export function canAccess(user: DemoUser | null, permission: TestPermission) {
  return user?.permissions.includes(permission) ?? false;
}
