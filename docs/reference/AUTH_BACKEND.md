# Database-backed authentication

October 19 update: the login form now authenticates seeded accounts from PostgreSQL through the existing Auth.js Credentials provider and one-hour JWT sessions. No frontend changes are required.

Start PostgreSQL yourself, run `npm run db:setup` once, configure a random `AUTH_SECRET`, run `npm run dev`, and visit `/login`. Use the locally generated `prisma/demo-accounts.txt`: for example `arden_stone` / `123` (Admin), `amber_arrow` / `123` (AC), or `alder_sol` / `123` (Faculty). Set `AUTH_DEMO_ENABLED=false` to disable the old reserved mock accounts; database login does not depend on that flag.

`account-auth.ts` verifies the seed-format scrypt hash asynchronously with a timing-safe comparison. Missing credentials, malformed hashes, wrong passwords, unknown users and inactive accounts are rejected. The shared `pg` pool in `db.ts` uses DATABASE_URL and parameterized queries against the Prisma-managed public schema; a generated Prisma client is not needed. Connection errors fail closed. `database-auth.ts` loads roles and permissions via the account joins. Password hashes never enter public identity/session responses.

JWTs identify accounts by their database UUID. Account status is checked during session reads. Protected requests reload the current database roles and permission links; client session updates cannot grant access. Removing roles/permission links or disabling an account takes effect on subsequent protected requests. Password changes do not revoke existing JWTs; sessions retain the existing one-hour lifetime.

For component test pages only, role names Faculty/AC/Admin also map to temporary `test:*` fixture permissions with the agreed hierarchy. Business permissions come from role_permission links. `/dashboard` is now the default landing page for every authenticated account with Faculty access. The sidebar includes five Faculty destinations and, for Admin only, Component Tests (`/test`) and Authentication Tests (`/auth-test`). Those test routes remain Admin-only. The shared shell receives the signed-in name and roles. Dashboard and observation route layouts enforce their read permissions on the server. Reserved development fixtures receive the same Faculty preview read permissions. Record ownership must still be checked by future business services.

Checks: `node --test tests/unit/account-auth.test.mjs tests/unit/demo-auth.test.mjs`; `node tests/integration/database-auth.mjs` against a running seeded development server (optional `TEST_BASE_URL`). Integration checks create only sessions and do not edit database records.

The older mock-mode guide below still applies to reserved development fixtures; its database-pending statements are historical and superseded by this update.

# Temporary authentication backend

This branch implements Auth.js Credentials/JWT sessions without a database. The database schema, real account lookup, password-hash verification, account status, production authentication, and final role/permission definitions remain separate work. No accounts are persisted.

## Run and test manually

The `/login` page checks the current user on the server before rendering the client
form. Active authenticated users redirect to `/test`; logged-out users see the form.
The Admin restriction on `/test` still applies, so Faculty/AC users are subsequently
sent to `/forbidden` until role-specific landing pages are introduced.

Access update: the shared main layout requires login. All `/test` pages and their
subpages, plus `/auth-test`, now require `test:admin` (the temporary Admin permission).
Faculty and AC users are redirected to `/forbidden`, outside the restricted test
layout to avoid a redirect loop. The default successful-login destination remains
`/test`, so non-admin demo users will see access denied there until real landing
pages are added. Test APIs retain their separate role-specific permission checks.
The shell receives safe user identity for the sidebar/header; navigation stays empty.

In your untracked `.env` or `.env.local`, set `AUTH_DEMO_ENABLED=true` and a random `AUTH_SECRET`. Generate a secret using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep it out of source control. Start `npm run dev` and visit `/login`. The custom login frontend is connected to Auth.js; only database-backed authentication remains pending.

Demo authentication requires BOTH `NODE_ENV=development` and `AUTH_DEMO_ENABLED=true`. It is always disabled for production and test mode. Sessions last one hour. Disabling the flag also invalidates existing demo access. Credentials must have nonempty string values; usernames are trimmed and lowercased.

| Username | Password | Temporary access |
| --- | --- | --- |
| faculty | 123 | Faculty only |
| ac | 123 | AC and Faculty |
| admin | 123 | Admin, AC, and Faculty |

Only faculty, ac, and admin with password 123 can sign in. Unknown usernames and incorrect passwords fail, as do blank or malformed credentials. Existing sessions for previously accepted arbitrary usernames no longer grant access.

After signing in, the default destination is `/test`, owned by the component branch. The component demo is integrated at /test and is Admin-only. `/auth-test` shows identity, permissions, links, and logout. Visit `/test/faculty`, `/test/ac`, and `/test/admin` directly. A permitted page says hello; a forbidden page redirects to `/forbidden`; logged-out page access redirects to /login. These placeholder pages are backend verification fixtures.

`GET /api/me` returns `{ id, username, name, roles, permissions }` or HTTP 401. `GET /api/test/faculty`, `/api/test/ac`, and `/api/test/admin` independently enforce permission checks: HTTP 200 when allowed, 401 when logged out, and 403 when forbidden. Unknown areas return 404. All three links intentionally remain visible on `/auth-test` so denied access can be exercised.

## Frontend handoff

The teammate's login component can use:

```tsx
import { signIn, signOut } from "next-auth/react";

const result = await signIn("credentials", {
  username,
  password,
  redirect: false,
  redirectTo: "/dashboard",
});
// On result.error: show "Invalid username or password".
// On success: router.push(result.url ?? "/dashboard").

await signOut({ redirectTo: "/login" });
```

Use the Auth.js helper for CSRF and cookie handling; do not store a token manually. Auth.js exposes `/api/auth/*`, including session, CSRF, credentials callback, and logout. `/api/auth/session` supplies the session identity; `/api/me` supplies the effective roles/permissions for navigation. Changing client state or session update data does not grant permissions.

The custom `/login` page is implemented. Server guards and test-page logout actions redirect to `/login`, and `pages.signIn` in `src/auth.ts` points there. The frontend uses the same Credentials provider and session handling as the backend.

## Server handoff

`getCurrentUser`, `requireUser`, `requirePermission`, and `checkApiPermission` live in `src/server/permissions.ts`. Pages and APIs must check access themselves. Layout authentication is an additional check, not a substitute. No record ownership checks exist because there are no business records yet.

`src/server/demo-auth.ts` is the temporary identity source. Replace it with real account queries, status checks, stored password-hash verification, and agreed effective permissions once the database is ready. Keep the Auth.js integration and `/api/me` response contract. Current test permissions grant access only to the test fixtures. Admin inherits AC and Faculty access; AC inherits Faculty access. Assigned roles remain unchanged; effective permissions include inherited access. Apply this agreed hierarchy when integrating database permissions.

## Automated checks

Requires Node 22.18+ or 24 for native TypeScript stripping:

```text
node --test tests/unit/demo-auth.test.mjs
npx tsc --noEmit
npm run lint
```

For the HTTP integration matrix, run an enabled development server on port 3000 (`npm run dev`), then `node tests/integration/demo-auth.mjs`. Set `TEST_BASE_URL` to target a different local address. The script tests anonymous access, all account types, direct page/API checks, wrong credentials, CSRF rejection, session persistence, and logout. It changes only its own test sessions. Expiration is configured but the test does not wait an hour to exercise it.
