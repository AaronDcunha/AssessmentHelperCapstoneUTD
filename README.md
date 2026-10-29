# Assessment Helper

Faculty observation and assessment coordination using Next.js.

Install Nodejs and Docker

## Login status

Login uses seeded PostgreSQL accounts and Auth.js sessions. Sample logins are generated locally in `prisma/demo-accounts.txt`. Successful login opens `/dashboard`. Faculty navigation is available to Faculty, AC, and Admin; only Admin sees and can access the test pages.

Set `AUTH_DEMO_ENABLED=false` to use only database accounts. Optional reserved `faculty`/`ac`/`admin` logins require development mode and `AUTH_DEMO_ENABLED=true`.

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

Copy the output into `.env.local`:

```dotenv
AUTH_SECRET=paste_generated_value_here
AUTH_DEMO_ENABLED=true
```

Keep `.env.local` private and uncommitted (it is ignored by Git). Reuse the same secret across restarts; changing it invalidates existing sessions. Restart `npm run dev` after changing these settings. Seeded login requires PostgreSQL to be running.

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

## Database setup and seeding

With `.env` configured and Docker Desktop running:

```sh
docker compose up -d --wait postgres
npm run db:setup
```

Creates the tables and seeds demo data. Run once initially, then again for new migrations or seed additions. Each developer has their own database in a local Docker volume; it is not committed to Git. Data persists when containers stop. The script requires PostgreSQL to be running and never starts Docker itself.

To rerun only the seed: `npm run db:seed`. Sample logins are generated locally in `prisma/demo-accounts.txt` (ignored by Git).

To browse the database (keep PostgreSQL running):

```sh
npx prisma studio
```

### Reset and reseed

With PostgreSQL running, run:

```sh
npx prisma migrate reset
npm run db:seed
```

Confirm the reset when prompted. **This deletes all data in the configured database**, including signups, assessments, and account changes, then recreates the tables and restores demo data.

## Dependencies to revisit

- Nodemailer: patched v10 is outside Auth.js beta's declared v7/v8 support; resolve compatibility before enabling email.
- Prisma tooling: `deepmerge-ts` and `mysql2` findings remain.
- ESLint tooling: `braces` dependency findings remain.
- Avoid `npm audit fix --force`; it proposes incompatible downgrades. Recheck before deployment.

## Deferred libraries

- Zod: not added as an application dependency; use explicit server-side validation for now.
- Testing: Vitest, React Testing Library, and Playwright are planned but not installed.


## Local workflow emails

New workflow notifications also queue email. With Mailpit running, configure
`EMAIL_DELIVERY_ENABLED=true` and run `npm run jobs:email` in a separate terminal.
Read captured mail at http://localhost:8025. The sender defaults to
`noreply_course_evaluation@assessmenthelper.edu`; old notifications are not emailed.
See [email delivery setup](docs/reference/EMAIL_DELIVERY.md) for migrations,
Mailpit settings, retries and tests. Production dependency-upgrade work listed
above remains separate from local Mailpit testing.


Shared notification helper: see [NOTIFICATION_HELPER.md](docs/reference/NOTIFICATION_HELPER.md) for the canonical sendNotification function, specific-user/list/role audiences, optional email, transaction examples and Mailpit testing.
