import type { PrismaClient } from "../generated/prisma/client";
import { getPrisma } from "./prisma";
import { authenticateAccount, fixturePermissions, publicAccount, type AccountRecord } from "./account-auth";
import { effectivePermissions } from "./admin-validation";
import { grantInclude } from "./queries/admin";

type AuthConnection = Pick<PrismaClient, "appUser" | "role">;

async function findAccount(db: AuthConnection, where: { username: string } | { userId: string }): Promise<AccountRecord | null> {
  const account = await db.appUser.findUnique({
    where, include: { loginCredential: true, userRoles: { include: { role: true } } },
  });
  if (!account) return null;
  const roles = account.userRoles.map(link => link.role.roleName).sort();
  const grants = await db.role.findMany({ include: grantInclude });
  return {
    id: account.userId, username: account.username ?? "", name: account.fullName,
    isActive: account.isActive, passwordHash: account.loginCredential?.passwordHash ?? null,
    roles, permissions: [...new Set([
      ...effectivePermissions(grants, account.userRoles.map(link => link.roleId)),
      ...fixturePermissions(roles),
    ])].sort(),
  };
}

export function authenticateDatabase(credentials: Partial<Record<"username" | "password", unknown>>, db: AuthConnection = getPrisma()) {
  return authenticateAccount(credentials, username => findAccount(db, { username }));
}

export async function resolveDatabaseUser(id: string, db: AuthConnection = getPrisma()) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return null;
  return publicAccount(await findAccount(db, { userId: id }));
}
