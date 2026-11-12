# Assessment Helper

Assessment Helper helps faculty and the Assessment Committee (AC) at The University of Texas at Dallas coordinate teaching observations. Faculty can sign up for evaluations, invite observers, complete assessments, and submit feedback. AC manages semesters, observer recommendations, templates, and reports. Administrators manage users, roles, permissions, and hiring levels.

[GitHub repository](https://github.com/AaronDcunha/AssessmentHelperCapstoneUTD)

## Table of Contents

- [Prerequisites](#prerequisites)
- [Technology Stack and Dependencies](#technology-stack-and-dependencies)
- [Environment Configuration](#environment-configuration)
- [Fresh Local Installation](#fresh-local-installation)
- [Demo Accounts and Login](#demo-accounts-and-login)
- [Deployment](#deployment)
- [Background Jobs](#background-jobs)
- [Resetting the Local Database](#resetting-the-local-database)
- [Additional Documentation](#additional-documentation)

## Prerequisites

- **Node.js 24.22.1 or later within the 24.x series.** The repository pins 24.22.1 in `.nvmrc`.
- **npm**, bundled with Node.js.
- **Git**, to clone the repository and check out the version you want to run.
- **Docker Desktop or Docker Engine with Docker Compose v2**, to run the supplied local PostgreSQL and Mailpit services.
- **PostgreSQL 18**, the version used by the supplied Compose configuration.

For a self-hosted deployment, the application and workers run on a Node.js host with access to PostgreSQL. Docker is required only if the deployment uses containers for supporting services.

For Hardware, a computer or VM capable of running Node.js and PostgreSQL, with persistent storage for database records and uploaded files, and a modern web browser for accessing the application is required.

## Technology Stack and Dependencies

- **Application:** Next.js 16.4.3, React and React DOM 19.2.9, and TypeScript 5.
- **Database:** PostgreSQL, Prisma ORM and Prisma Client 7.10.1, `@prisma/adapter-pg`, and the `pg` driver.
- **Authentication:** Auth.js through `next-auth` 5 beta, with database-backed credentials.
- **Interface:** Tailwind CSS 4, `@tailwindcss/postcss`, and `@daypicker/react`.
- **Background jobs:** `node-cron` for the email worker and Faculty invitation expiry scheduler.
- **Email:** Nodemailer, installed under the `smtp-mailer` alias, and Mailpit for local email testing.
- **Development tooling:** ESLint, `eslint-config-next`, and type packages for Node.js, PostgreSQL, React, and React DOM.

See [`package.json`](package.json) for dependency declarations and [`package-lock.json`](package-lock.json) for the exact resolved versions. Use `npm ci` to install from the lockfile.

## Environment Configuration

For local development, copy [`.env.example`](.env.example) to `.env` in the repository root. Keep environment files private.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL for the application, Prisma, and workers. The local example uses `127.0.0.1:5432` and the `public` schema. |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database name, user, and password used to initialize the local PostgreSQL container. Match these values in `DATABASE_URL`. |
| `POSTGRES_PORT` | PostgreSQL host port for local Compose. Defaults to `5432`. |
| `AUTH_SECRET` | Required Auth.js secret. Generate a unique value for each environment and keep it stable across restarts. |
| `AUTH_DEMO_ENABLED` | Keep `false` for normal database-backed login, including seeded demo accounts. |
| `EMAIL_DELIVERY_ENABLED` | Set to `true` to run the email worker. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | SMTP host, port, and implicit TLS setting. Local Mailpit uses `127.0.0.1`, `1025`, and `false`. For deployment, use the SMTP provider’s settings. |
| `SMTP_USER`, `SMTP_PASSWORD` | SMTP credentials. Set both if your SMTP server requires authentication. Leave both empty for local Mailpit. |
| `MAIL_FROM` | Sender address and display name. Use an address authorized by your SMTP provider in deployment. |
| `MAILPIT_UI_PORT` | Local Mailpit inbox port. Defaults to `8025`. |
| `FACULTY_ATTACHMENT_DIR` | Optional private directory for uploaded supporting files. Defaults to `.local/private-faculty-attachments`. In deployment, use a persistent, writable directory outside `public`. |

Generate `AUTH_SECRET` with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use a separate password for PostgreSQL. Percent-encode URL-reserved characters in the password when placing it in `DATABASE_URL`. PostgreSQL uses `POSTGRES_PASSWORD` when it initializes a new Docker volume. Changing the environment variable later does not change the password stored in an existing database.

Local setup requires no external API key. For real email delivery, obtain SMTP access and any required credentials from your provider.

## Fresh Local Installation

1. **Clone the repository and install dependencies.**

   ```sh
   git clone https://github.com/AaronDcunha/AssessmentHelperCapstoneUTD.git
   cd AssessmentHelperCapstoneUTD
   npm ci
   ```

2. **Create and configure `.env`.** Run `Copy-Item .env.example .env` in PowerShell or `cp .env.example .env` in Bash. Set the PostgreSQL password in both `POSTGRES_PASSWORD` and `DATABASE_URL`, then set `AUTH_SECRET`.

3. **Start the supporting services and initialize the database.** Start Docker Desktop or Docker Engine before running these commands.

   ```sh
   docker compose up -d --wait
   npm run db:generate
   npm run db:setup
   ```

   `db:setup` applies the checked-in migrations, checks the schema, and loads the demo data. The seed adds demo accounts and course data, then creates ten signup fixtures and attempts to create late-invitation scenarios. The signup fixtures require a configured current semester, a future observation deadline, and enough upcoming class meetings. If that step fails, the basic demo data remains available. Correct the reported configuration and rerun `npm run db:seed`.

4. **Start the application.**

   ```sh
   npm run dev
   ```

   Run the background workers as mentioned in [Background Jobs](#background-jobs)

5. **Open [Assessment Helper](http://localhost:3000)** and sign in with a demo account below. Start the workers in separate terminals if you want to test email delivery or invitation expiry. Local test email appears in [Mailpit](http://localhost:8025).

To stop the local installation, press **Ctrl+C** in the app and worker terminals, then run `docker compose down`. Docker retains the database and Mailpit volumes.

## Demo Accounts and Login

After seeding a fresh local database, sign in with one of these accounts:

| Workflow | Name | Username | Password |
| --- | --- | --- | --- |
| Faculty | Alder Sol | `alder_sol` | `123` |
| Assessment Committee | Amber Arrow | `amber_arrow` | `123` |
| Administration | Arden Stone | `arden_stone` | `123` |

These are seeded test accounts for local development and private demonstrations. Some accounts have multiple roles, so the sidebar reflects all permissions assigned to the account. Keep `AUTH_DEMO_ENABLED=false` to sign in with the seeded database accounts. The seed also writes a login reference to `prisma/demo-accounts.txt`.

## Deployment

These instructions describe a self-hosted Node.js deployment on a server or VM.

1. **Prepare the host.** Install the supported Node.js version and provision PostgreSQL. Create the database and configure persistent storage for both PostgreSQL and supporting files. For HTTPS access, configure a reverse proxy and TLS certificate for the deployment hostname.

2. **Check out the release and install dependencies.**

   ```sh
   git clone https://github.com/AaronDcunha/AssessmentHelperCapstoneUTD.git
   cd AssessmentHelperCapstoneUTD
   npm ci
   ```

   If deploying a specific release tag or commit, check it out before running `npm ci`.

3. **Configure the deployment environment.** Set `DATABASE_URL`, a deployment-specific `AUTH_SECRET`, `AUTH_DEMO_ENABLED=false`, and `FACULTY_ATTACHMENT_DIR`. If using email delivery, configure SMTP credentials, an authorized sender, and `EMAIL_DELIVERY_ENABLED=true`. Make the settings available to the application and its workers.

4. **Apply migrations and build the application.**

   ```sh
   npm run db:migrate
   npm run build
   ```

   `db:migrate` applies pending migrations. The build generates Prisma Client before compiling the application. For an existing deployment, back up PostgreSQL and the private attachment directory before applying an update.

5. **Provision access.** The application requires a database-backed account with the appropriate grants. For a private demonstration, use the local installation steps to initialize and seed a local database on the VM before serving the production build. Restrict access to that environment because it contains demo credentials. For a real deployment, use a database with an authorized Admin already provisioned or arrange a controlled account import with the project team. The repository currently has no standalone production Admin bootstrap command.

6. **Start the production app.** If the reverse proxy runs on the same host, bind Next.js to loopback and route HTTPS traffic to port `3000`.

   ```sh
   npm start -- --hostname 127.0.0.1 --port 3000
   ```

   Configure the proxy to forward the original host and protocol. Use a process manager to keep the app running and start it after a reboot. Start the background jobs as separate managed processes when their functions are needed.

7. **Configure the evaluation cycle.** Sign in with an authorized account. Set the semester dates, time zone, and evaluation deadlines, and publish an observation template before opening the cycle for Faculty signups.

## Background Jobs

Start each job from the repository folder in a separate terminal or managed process. The app and workers use the same database configuration.

| Command | Purpose |
| --- | --- |
| `npm run jobs:email` | Delivers queued notification emails every minute. Requires `EMAIL_DELIVERY_ENABLED=true` and working SMTP settings. |
| `npm run jobs:email:once` | Processes one batch of queued emails for local testing. |
| `npm run jobs:faculty` | Checks unanswered observer invitations every five minutes and marks them **Expired** when their response windows close. |

Observees send invitations from their published recommendation list by selecting candidates and clicking **Send invitations**. For local email testing, use the [Mailpit inbox](http://localhost:8025). Restart the app and workers after changing environment settings.

## Resetting the Local Database

**Resetting permanently deletes all records in the database targeted by `DATABASE_URL`.** Verify that it points to your own local development database. Stop the app and workers, and leave PostgreSQL running.

```sh
npx prisma migrate reset --config prisma.config.mjs
npm run db:generate
npm run db:seed
```

Confirm the reset when prompted. Run the commands in order and stop if one fails. The commands reapply migrations and restore the demo data, login reference, and signup fixtures. Restart the app and workers afterward. Mailpit’s captured messages and uploaded files are stored separately from the database.

## Additional Documentation

- [Project references and feature guides](docs/reference/README.md)
- [Authentication and permissions](docs/reference/AUTH_BACKEND.md)
- [Email configuration and delivery](docs/reference/EMAIL_DELIVERY.md)
- [Shared notification service](docs/reference/NOTIFICATION_HELPER.md)