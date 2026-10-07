# Assessment Helper

Faculty observation and assessment coordination using Next.js.

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

## Dependencies to revisit

- Nodemailer: patched v10 is outside Auth.js beta's declared v7/v8 support; resolve compatibility before enabling email.
- Prisma tooling: `deepmerge-ts` and `mysql2` findings remain.
- ESLint tooling: `braces` dependency findings remain.
- Avoid `npm audit fix --force`; it proposes incompatible downgrades. Recheck before deployment.

## Deferred libraries

- Zod: not added as an application dependency; use explicit server-side validation for now.
- Testing: Vitest, React Testing Library, and Playwright are planned but not installed.
