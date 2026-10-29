# Dependency security update — October 28, 2026

The audit covered direct/indirect npm dependencies, the Node runtime, and the
PostgreSQL/Mailpit development services. Changes were made on `main`; committing
and pushing them is still required to share them with teammates.

## Updated versions

| Component | Previously committed / configured | Updated |
| --- | --- | --- |
| Next.js | 16.4.0 in the lockfile; local installation was 16.4.2 | 16.4.3 |
| eslint-config-next | 16.4.0 in the lockfile | 16.4.3 |
| React / React DOM | 19.2.8 | 19.2.9 |
| Prisma CLI, client and PostgreSQL adapter | 7.10.0 in the lockfile | 7.10.1, kept aligned |
| SMTP Nodemailer | 8.0.11 | 10.2.1, installed as `smtp-mailer` |
| Node type definitions | 20.19.43 | 24.19.2 |
| Node target | System runtime was 24.13.0 | 24.22.1, pinned in `.nvmrc` and `.node-version` |
| Mailpit image | v1.27.4 | v1.32.0 |
| PostgreSQL | `postgres:18` | Same major/tag; running instance verified as 18.6 |

Compatible indirect dependency fixes include deepmerge-ts 8.0.2 (through Prisma),
mysql2 3.24.4 (Prisma tooling), fast-uri 3.1.9 and zod 4.6.7. Existing unrelated
dependency major versions were retained. Sharp was already patched at 0.35.5.

The initial locked tree reported 10 npm audit findings: one critical, eight high,
one moderate. The updated tree reports **zero known npm audit vulnerabilities**.
This is the current registry advisory result, not a guarantee that no unknown
vulnerabilities exist.

Official references:

- [Next.js October security update](https://nextjs.org/blog/nextjs-security-update-october-14-2026)
- [Next.js 16.4.3 release](https://github.com/vercel/next.js/releases/tag/v16.4.3)
- [React Server Components security advisory](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3)
- [Nodemailer 10 releases](https://github.com/nodemailer/nodemailer/releases)
- [Node 24.22.1 security release](https://nodejs.org/en/blog/release/v24.22.1)
- [Mailpit 1.32.0 security release](https://github.com/axllent/mailpit/releases/tag/v1.32.0)

## Why the mailer has an alias

Auth.js 5.0.0-beta.32 and its @auth/core dependency declare an **optional**
Nodemailer peer covering v7/v8, which is outside the patched v10 range. This app
uses the Credentials provider, not Auth.js's Nodemailer/magic-link provider.

The application's SMTP worker now imports `smtp-mailer`, an npm alias for the
official `nodemailer@10.2.1` package. This lets the worker use the patched version
without forcing an unsupported peer into Auth.js or installing vulnerable v8.
Nodemailer 10 supplies its own TypeScript definitions, so @types/nodemailer was
removed. No `--force`, `--legacy-peer-deps` or security-advisory suppression was
used. If adding Auth.js email login later, revisit its provider compatibility;
the alias does not claim to make that provider support v10.

Existing workflow email behavior, recipient selection, templates and the shared
notification helper remain unchanged. Real SMTP capture was retested in Mailpit.

## Deliberately deferred upgrades

- TypeScript 7 is a separate compiler migration; this security update keeps 5.9.3.
- Prisma 8's registry latest was a release candidate; this project stays on 7.10.1.
- ESLint 10 is outside the current eslint-plugin-react peer range. ESLint 9.39.5
  is retained; npm warns that this line is no longer supported. Upgrade the lint
  plugin/configuration stack together in a separate change. It has no remaining
  reported npm audit finding in this lockfile.
- React 19.3 adds features; the patched 19.2.9 backport avoids an unrelated feature
  upgrade while keeping React and React DOM aligned.
- `next-auth@latest` is v4, while this project uses v5 APIs. Do not downgrade it or
  accept npm's proposed v1 downgrade as an audit fix.
- Node 26 and PostgreSQL 19 are separate major-version changes and were not adopted.

## Your commit and push

Yes: commit **both `package.json` and `package-lock.json`**. The lockfile is what
reproduces the complete patched dependency tree. Updating only your local
node_modules does not update anybody else's installation or CI.

Include the rest of this change too: `.nvmrc`, `.node-version`, `.gitignore`,
`compose.yaml`, the SMTP transport import, Admin/configuration route-context
typing fixes, and the documentation changes. Review `git diff`, create your normal
commit/PR, and push it through the team's usual workflow. This work has not
automatically committed or pushed anything.

Do not commit node_modules, .next, downloaded Node binaries, local logs, .env files,
database backups/volumes or demo credentials. Local verification tooling/logs are
ignored under `.local/tooling` and `.local/logs`.

## What each teammate does after the change is pushed

1. Save/commit their own work and pull the updated branch using the team's normal
   Git workflow (`git pull --ff-only` when working directly on main).
2. Install or select **Node 24.22.1**, then reopen their terminal and check
   `node --version`. With nvm/nvm-windows:

   ```sh
   nvm install 24.22.1
   nvm use 24.22.1
   ```

   Without a version manager, use the installer from the
   [official Node release page](https://nodejs.org/en/blog/release/v24.22.1).
   Git pulls and npm installs do not update a system-wide Node installation.
   The project's supported runtime range is Node 24.22.1 or newer **within 24.x**.

3. Stop the app and background workers, then run from the application folder:

   ```sh
   npm ci
   npm run db:generate
   docker compose pull mailpit
   docker compose up -d --wait postgres mailpit
   npm run dev
   ```

4. For local email testing, run `npm run jobs:email` in a separate terminal with
   `EMAIL_DELIVERY_ENABLED=true`. Restart any already-running workers after the
   package/runtime upgrade so they load the new mailer.

`npm ci` replaces the generated dependency directory using the committed lockfile;
teammates should not independently run npm update and create a different tree.
Keep local .env files. **No database reset, reseed, or new migration is required**
by this dependency update. Mailpit/PostgreSQL volumes are preserved.

An older local Node installation will produce an engine warning. The project
version files document the target; they do not automatically replace Node on a
machine that does not have a version manager configured.

## Verification and compatibility fixes

- A clean `npm ci --ignore-scripts` completed after normalizing missing indirect
  WebAssembly dependency entries. Dependency install scripts were then checked
  with npm rebuild, and Prisma was explicitly regenerated.
- All 241 unit tests passed; the existing optional PostgreSQL plan test was skipped.
- Populated Faculty regression passed all 15 disposable-database groups, including
  signups, invitations, matching, acknowledgements, permissions and attachments.
- Email queue/retry integration and shared-helper integration passed with patched
  Nodemailer and Mailpit, including actual capture for fake recipients.
- The production `npm run build` passed using Next.js 16.4.3's default Turbopack
  pipeline, including generated route type checks and page generation.

The previously known Admin/AC generated route errors were corrected by declaring
their route context parameter as required, matching Next.js's handler contract.
Runtime authentication, authorization and body-validation logic were preserved.

A Windows build failure also exposed background worker logs placed in `.next`:
Next must clear that directory during builds, and open logs prevented it. Local
background process logs now live under ignored `.local/logs`, outside build output.

Verification used an official Node 24.22.1 executable downloaded into ignored
project-local tooling, with SHA-256 verified against the official checksums. The
system-wide Node executable was **not** replaced; the user and teammates still
need to install/select the pinned version for their own terminals and services.


Production smoke verification also passed actual seeded Faculty/AC/Admin login,
notification APIs and alert/reminder authorization/read behavior. Standalone
production Auth.js requires its trusted canonical URL; the loopback-only smoke
server used process-local AUTH_URL=http://localhost:3000. A real deployment must
configure AUTH_URL for its own HTTPS hostname. No .env file or global trust policy
was changed for this test. Full tsc --noEmit and repository lint also passed.

The isolated Notifications and AC alert/reminder browser smoke tests also passed
against the production build, including desktop/mobile layout and read-state
behavior. Their business API writes were intercepted. The temporary production
server was stopped after verification, and the previously running email worker
was restored using the patched local runtime with logs outside .next.
