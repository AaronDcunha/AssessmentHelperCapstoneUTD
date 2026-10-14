# Temporary authentication backend

This branch implements Auth.js Credentials/JWT sessions without a database. The database schema, real account lookup, password-hash verification, account status, production authentication, and final role/permission definitions remain separate work. No accounts are persisted.

## Run and test manually

In your untracked `.env` or `.env.local`, set `AUTH_DEMO_ENABLED=true` and a random `AUTH_SECRET`. Generate a secret using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep it out of source control. Start `npm run dev` and visit `/api/auth/signin?callbackUrl=%2Ftest` for Auth.js's built-in sign-in form. No custom login frontend is implemented on this branch.

Demo authentication requires BOTH `NODE_ENV=development` and `AUTH_DEMO_ENABLED=true`. It is always disabled for production and test mode. Sessions last one hour. Disabling the flag also invalidates existing demo access. Credentials must have nonempty string values; usernames are trimmed and lowercased.

| Username | Password | Temporary access |
| --- | --- | --- |
| faculty | 123 | Faculty only |
| ac | 123 | AC and Faculty |
| admin | 123 | Admin, AC, and Faculty |
| Any other username | Any nonempty password | All three test areas |

A reserved username with the wrong password fails; it never falls through to unrestricted access. Blank or malformed credentials fail. There is no anonymous automatic login: arbitrary credentials create an authenticated demo session so logout and unauthenticated checks can still be tested.

After signing in, the default destination is `/test`, owned by the component branch. This branch preserves the empty /test placeholder from main until the component branch is integrated. `/auth-test` shows identity, permissions, links, and logout. Visit `/test/faculty`, `/test/ac`, and `/test/admin` directly. A permitted page says hello; a forbidden page redirects to `/test/forbidden`; logged-out page access redirects to the built-in sign-in screen. These placeholder pages are backend verification fixtures.

`GET /api/me` returns `{ id, username, name, roles, permissions }` or HTTP 401. `GET /api/test/faculty`, `/api/test/ac`, and `/api/test/admin` independently enforce permission checks: HTTP 200 when allowed, 401 when logged out, and 403 when forbidden. Unknown areas return 404. All three links intentionally remain visible on `/auth-test` so denied access can be exercised.

## Frontend handoff

The teammate's login component can use:

```tsx
import { signIn, signOut } from "next-auth/react";

const result = await signIn("credentials", {
  username,
  password,
  redirect: false,
  redirectTo: "/test",
});
// On result.error: show "Invalid username or password".
// On success: router.push(result.url ?? "/test").

await signOut({ redirectTo: "/login" }); // Once the teammate implements /login.
```

Use the Auth.js helper for CSRF and cookie handling; do not store a token manually. Auth.js exposes `/api/auth/*`, including session, CSRF, credentials callback, and logout. `/api/auth/session` supplies the session identity; `/api/me` supplies the effective roles/permissions for navigation. Changing client state or session update data does not grant permissions.

The frontend owns `/login`; this branch does not claim that route. Until it exists, server guards redirect to the built-in form. When integrating, change the guard redirect to `/login` and configure `pages.signIn` in `src/auth.ts` together.

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
