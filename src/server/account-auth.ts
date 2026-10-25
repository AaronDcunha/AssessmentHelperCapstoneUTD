import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);
export type AccountUser = {
  id: string; username: string; name: string; roles: string[]; permissions: string[];
};
export type AccountRecord = AccountUser & { isActive: boolean; passwordHash: string | null };
// Same work for unknown users to avoid a fast account-existence check.
const dummyHash = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await deriveKey(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${hash.toString("hex")}`;
}

export function usernameFromName(name: string): string {
  const parts = name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .split(/\s+/).map(part => part.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]}_${parts.at(-1)}` : parts[0] || "user").slice(0, 90);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
  if (!match) return false;
  const actual = await deriveKey(password, match[1], 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(match[2], "hex"));
}

export function publicAccount(account: AccountRecord | null): AccountUser | null {
  if (!account?.isActive) return null;
  return { id: account.id, username: account.username, name: account.name,
    roles: account.roles, permissions: account.permissions };
}

export async function authenticateAccount(
  credentials: Partial<Record<"username" | "password", unknown>>,
  findByUsername: (username: string) => Promise<AccountRecord | null>,
): Promise<AccountUser | null> {
  const { username, password } = credentials;
  if (typeof username !== "string" || typeof password !== "string") return null;
  const normalized = username.trim().toLowerCase();
  if (!normalized || normalized.length > 100 || !password.trim() || password.length > 256) return null;
  const account = await findByUsername(normalized);
  const valid = await verifyPassword(password, account?.passwordHash ?? dummyHash);
  if (!valid || !account?.passwordHash) return null;
  return publicAccount(account);
}

// Temporary component test routes use fixture permissions, never business grants.
export function fixturePermissions(roles: string[]): string[] {
  const names = new Set(roles.map(role => role.toLowerCase()));
  if (names.has("admin")) return ["test:faculty", "test:ac", "test:admin"];
  if (names.has("ac")) return ["test:faculty", "test:ac"];
  return names.has("faculty") ? ["test:faculty"] : [];
}
