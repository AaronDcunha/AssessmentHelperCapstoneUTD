import { getPool } from "./db";
import { authenticateAccount, fixturePermissions, publicAccount, type AccountRecord } from "./account-auth";

async function findAccount(field: "username" | "user_id", value: string): Promise<AccountRecord | null> {
  // field is a code-owned union; all user input is parameterized.
  const result = await getPool().query<AccountRecord>(`
    SELECT u.user_id AS id, COALESCE(u.username, '') AS username, u.full_name AS name,
      u.is_active AS "isActive", lc.password_hash AS "passwordHash",
      COALESCE((SELECT array_agg(DISTINCT r.role_name ORDER BY r.role_name)
        FROM public.user_role ur JOIN public.role r ON r.role_id = ur.role_id
        WHERE ur.user_id = u.user_id), ARRAY[]::text[]) AS roles,
      COALESCE((SELECT array_agg(DISTINCT p.permission_name ORDER BY p.permission_name)
        FROM public.user_role ur
        JOIN public.role assigned ON assigned.role_id = ur.role_id
        JOIN public.role effective ON effective.role_id = assigned.role_id
          OR (assigned.role_name = 'Admin' AND effective.role_name IN ('AC', 'Faculty'))
          OR (assigned.role_name = 'AC' AND effective.role_name = 'Faculty')
        JOIN public.role_permission rp ON rp.role_id = effective.role_id
        JOIN public.permission p ON p.permission_id = rp.permission_id
        WHERE ur.user_id = u.user_id), ARRAY[]::text[]) AS permissions
    FROM public.app_user u
    LEFT JOIN public.login_credential lc ON lc.user_id = u.user_id
    WHERE u.${field} = $1 LIMIT 1`, [value]);
  const account = result.rows[0];
  if (!account) return null;
  account.permissions = [...new Set([...account.permissions, ...fixturePermissions(account.roles)])];
  return account;
}

export function authenticateDatabase(credentials: Partial<Record<"username" | "password", unknown>>) {
  return authenticateAccount(credentials, username => findAccount("username", username));
}

export async function resolveDatabaseUser(id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return null;
  return publicAccount(await findAccount("user_id", id));
}
