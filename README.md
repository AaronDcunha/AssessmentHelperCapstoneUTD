# Assessment Helper

Faculty observation and assessment coordination using Next.js, PostgreSQL, and Auth.js.

## First-time setup

Install **Node.js 24.22.1** (see `.nvmrc`) and **Docker Desktop**. Run these commands from this project folder:

```powershell
npm ci
Copy-Item .env.example .env
```

Configure `.env`:

- Replace the password placeholder in both `POSTGRES_PASSWORD` and `DATABASE_URL` with the same password. Keep the database name, user, and port consistent too.
- Replace `AUTH_SECRET` with a secret generated using the command below. Keep it across restarts; changing it signs users out.
- Keep `AUTH_DEMO_ENABLED=false` for seeded database accounts and `EMAIL_DELIVERY_ENABLED=true` for local email testing.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Start Docker Desktop, then initialize the database:

```powershell
docker compose up -d --wait
npm run db:setup
```

`db:setup` applies migrations, checks the schema, and seeds demo accounts/courses plus ten signup fixtures. It does **not** reset existing data or start Docker. Sample logins are written to `prisma/demo-accounts.txt`. Keep environment files and that login file private; they are ignored by Git.

## Start and stop locally

Start the Docker services, then run the app and each worker in **separate terminals**:

```powershell
docker compose up -d --wait
```

| Terminal | Command | Purpose |
| --- | --- | --- |
| App | `npm run dev` | Website and APIs |
| Email worker | `npm run jobs:email` | Delivers queued emails to Mailpit every minute |
| Faculty scheduler | `npm run jobs:faculty` | Processes invitation expiry and automatic resends every five minutes |

Workers do not start automatically with the app. To process one email batch instead, use `npm run jobs:email:once`.

- [App](http://localhost:3000) — sign in with a seeded account; access follows assigned permissions.
- [Mailpit inbox](http://localhost:8025) — captures local test emails; it does not send to real inboxes.
- PostgreSQL: `localhost:5432`; Mailpit SMTP: `localhost:1025` (defaults).

To stop, press **Ctrl+C** in each app/worker terminal, then run `docker compose down`. Database and Mailpit data remain in Docker volumes.

Optional reserved `faculty`/`ac`/`admin` mock logins require development mode and `AUTH_DEMO_ENABLED=true`; they are separate from seeded business accounts. Restart the app/workers after environment changes. `.env.local` can override `.env` for the app/workers; keep database credentials in `.env` consistent with Docker and database scripts.

## Database maintenance

Keep PostgreSQL running for these commands. Each developer has their own local database; Git does not share its contents.

| Action | Command | Effect |
| --- | --- | --- |
| Apply updates and seed additions | `npm run db:setup` | Applies checked-in migrations and reruns the seed without resetting the database |
| Apply migrations only | `npx prisma migrate deploy` | Updates tables without running the seed |
| Rerun the seed only | `npm run db:seed` | Seeds basic demo data, then ten signup fixtures; preserves existing signups/progress |
| Preview basic seed data | `npm run db:seed:preview` | No database reads/writes; generates the local demo-login reference; signup preview is separate |
| Preview ten demo signups | `npm run db:seed:signups:preview` | Reads the database and lists the proposed signup fixtures; writes nothing |
| Add ten demo signups | `npm run db:seed:signups` | Adds signups, unassigned observations, and three proposed meetings per new signup |
| Browse records | `npx prisma studio` | Opens the database editor |

The basic seed preserves existing cycle/template/question edits. It does not recreate manually added signups, matching, or completed assessments. Reseeding is not a reset and may update other seeded records.

For team workflow testing, `npm run db:seed` runs both seeds in order automatically.
`npm run db:setup` uses the same sequence after migrations. If the signup step fails,
the basic seed remains saved; fix the reported configuration issue and rerun.
The shared script is `prisma/seed-signups.mjs`. It uses the same ten demo professors,
their real assigned sections, and valid future class dates in the current configured
semester. Existing signups and any later workflow progress are preserved on reruns.
It creates no matching, releases, invitations, assessments, or notifications.
This local-only demo seed can bypass a closed signup deadline without
changing normal signup rules. It requires configured semester dates and enough future
meetings before the observation deadline; otherwise the entire batch rolls back.
To explicitly target a cycle, use `npm run db:seed:signups -- --cycle-id=UUID`.
After a database reset, `npm run db:seed` restores the basic data and ten signups together.

### Reset the database and restore demo data

**This deletes all data in the database/schema targeted by `.env`**, including added users, signups, observations, assessments, and local test fixtures. Confirm `DATABASE_URL` points to your intended local database first. Stop the app and workers; leave PostgreSQL running.

```powershell
npx prisma migrate reset
npm run db:seed
```

Confirm the reset when prompted. The first command recreates the schema from migrations; the second restores the basic demo data, login reference, and ten signup fixtures. Then restart the app and workers.

This does not clear Mailpit's captured messages or private attachment files. Avoid `docker compose down --volumes` unless you also intend to erase the Docker database and Mailpit volumes. Changing `POSTGRES_PASSWORD` in `.env` does not change the password inside an existing database volume.

## Checks and builds

```powershell
npm run lint
npx next typegen
npx tsc --noEmit
node --import ./scripts/server-loader.mjs --test tests/unit/*.test.mjs
```

For a production build, run `npm run build`, then `npm start`. Email and Faculty workers still run separately. Integration/browser tests have their own database/server requirements; see the relevant feature reference before running them.

After pulling changes, run `npm ci` when dependencies changed and `npm run db:setup` when migrations/seed data changed. Do not reset to resolve a migration error without checking the cause.

## Further documentation

- [Project references and feature guides](docs/reference/README.md)
- [Authentication and permissions](docs/reference/AUTH_BACKEND.md)
- [Email configuration, retries, and testing](docs/reference/EMAIL_DELIVERY.md)
- [Shared notification helper](docs/reference/NOTIFICATION_HELPER.md)
- [Dependency update instructions](docs/reference/DEPENDENCY_UPDATES.md)

Validation currently uses explicit server-side checks. Vitest, React Testing Library, and Playwright are not installed; existing tests use the repository's Node/browser scripts.
