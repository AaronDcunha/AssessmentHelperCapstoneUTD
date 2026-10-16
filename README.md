# Assessment Helper

Faculty observation and assessment coordination using Next.js.

Install Nodejs and Docker

## Login status

Login frontend and backend are implemented for development: the custom `/login`
page connects to Auth.js, creates sessions, handles login errors and logout, and
enforces server-side role-based access on protected test pages and APIs.

Authentication currently uses three temporary accounts, all with password `123`:

- `faculty`: Faculty access.
- `ac`: Faculty and Assessment Committee access.
- `admin`: Faculty, Assessment Committee, and Admin access.

Unknown usernames and incorrect passwords are rejected. Successful login redirects
to `/test`; `/auth-test` shows the current identity and permission-test links.

**Database integration remains pending:** replace temporary users with real account
lookup, password-hash verification, account-status checks, and database-backed roles
and permissions. Demo login requires the local settings below and is disabled in
production; database-backed production login is not implemented yet.

See [authentication backend details](docs/reference/AUTH_BACKEND.md).

## Setup

1. Open the project folder and run `npm ci`.
2. Copy `.env.example` to `.env` (only on first setup).
3. Replace the password placeholder in both `POSTGRES_PASSWORD` and `DATABASE_URL` with the same password.
4. Start Docker, then run the commands below.

PostgreSQL and Mailpit run in Docker; no separate installations needed.

## Run locally

### Local authentication setup

Each teammate should generate their own Auth.js secret once, from the project folder:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the output into `.env.local` and enable the temporary development login:

```dotenv
AUTH_SECRET=paste_generated_value_here
AUTH_DEMO_ENABLED=true
```

Keep `.env.local` private and uncommitted (it is ignored by Git). Reuse the same secret across restarts; changing it invalidates existing sessions. Restart `npm run dev` after changing these settings. Demo login only works in development, with no database required for authentication.

### Start the services

```bash
#To Start
docker compose up -d --wait
npm run dev

#To Stop Docker:
docker compose down
```

- App: http://localhost:3000
- Mailpit inbox: http://localhost:8025 (captures test emails only)
- PostgreSQL: `localhost:5432`; SMTP: `localhost:1025`

## Dependencies to revisit

- Nodemailer: patched v10 is outside Auth.js beta's declared v7/v8 support; resolve compatibility before enabling email.
- Prisma tooling: `deepmerge-ts` and `mysql2` findings remain.
- ESLint tooling: `braces` dependency findings remain.
- Avoid `npm audit fix --force`; it proposes incompatible downgrades. Recheck before deployment.

## Deferred libraries

- Zod: not added as an application dependency; use explicit server-side validation for now.
- Testing: Vitest, React Testing Library, and Playwright are planned but not installed.
