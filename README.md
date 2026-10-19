# Assessment Helper

Faculty observation and assessment coordination using Next.js.

Install Nodejs and Docker

## Setup

1. Open the project folder and run `npm ci`.
2. Copy `.env.example` to `.env` (only on first setup).
3. Replace the password placeholder in both `POSTGRES_PASSWORD` and `DATABASE_URL` with the same password.
4. Start Docker, then run the commands below.

PostgreSQL and Mailpit run in Docker; no separate installations needed.

## Run locally

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

## Dependencies to revisit

- Nodemailer: patched v10 is outside Auth.js beta's declared v7/v8 support; resolve compatibility before enabling email.
- Prisma tooling: `deepmerge-ts` and `mysql2` findings remain.
- ESLint tooling: `braces` dependency findings remain.
- Avoid `npm audit fix --force`; it proposes incompatible downgrades. Recheck before deployment.

## Deferred libraries

- Zod: not added as an application dependency; use explicit server-side validation for now.
- Testing: Vitest, React Testing Library, and Playwright are planned but not installed.
