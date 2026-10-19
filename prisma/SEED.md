# Local demo seed

Run with Node 22.9 or newer and installed dependencies:

```sh
npm run db:seed:preview
npm run db:seed
```

Preview validates the dataset and writes `prisma/demo-accounts.txt` without connecting to PostgreSQL. Actual seeding requires `DATABASE_URL` in `.env` and an existing database matching `schema.prisma`, including the new unique `AppUser.username` column. No migration is applied by this script. The seed uses the existing `pg` dependency and parameterized SQL, so it does not require a generated Prisma client. Production mode is rejected.

Rows missing instructor/day/time or containing date-prefixed days are excluded. Departments use source subject codes; professors get the first department encountered among retained rows. Course titles use the latest chronological term, remove the suffix following a spaced dash, strip trailing parenthetical credit labels, and collapse whitespace. Course level is the first course-code digit multiplied by 1,000. Meeting days become separate rows with 24-hour `HH:mm` times; blank locations become null. Hire dates remain unset. No evaluation history is invented.

Every retained instructor receives `firstname_lastname`, `firstname.lastname@fakeutd.edu`, and initial password `123`. SHA-256 of `roles-v1:<username>` determines a bucket: 0–1 adds AC and Admin, 2–11 adds AC, and the rest are Faculty only. Everyone has Faculty. Role grants are repeatable, independent of input ordering. Permission names and grants are defined in `seed-data.mjs`: Faculty has own-record actions, AC adds cycle/matching/template/approval/report management, and Admin adds account/role/permission/hiring-level management. Grants are cumulative. Backend ownership, participant, deadline and AC-scope checks are still required. Seeded grants do not enforce access. AC access to individual process feedback remains unresolved and is not granted.

Passwords are stored as `scrypt:<hex salt>:<hex hash>`, using Node's default scrypt parameters and a 64-byte derived key. The authentication implementation must use that format and a timing-safe comparison. Random salts intentionally make stored hashes different across machines while the password and accounts remain the same. Login is not implemented by this seed.

Writes occur in one transaction with a seed-specific advisory lock. IDs are deterministically derived from stable source keys. Reruns update demo profile/course/schedule data, preserve existing passwords and added roles, and do not delete unrelated records or obsolete seed records. Natural-key conflicts with records created outside this seed cause a rollback rather than silently merging accounts. The login reference lists initial passwords; after a password change it is no longer authoritative for that account.

## Fall 2026 cycle and basic template

The seed creates one cycle named Fall 2026, linked to the existing `26f` semester. Deadlines are October 31 (signup), November 30 (observation), and December 7 (feedback), 2026, at 11:59 p.m. America/Chicago. Dates are converted to UTC before insertion, accounting for daylight saving time.

One active Basic Classroom Observation template contains four required `RATING` questions (clear objectives, organized instruction, student engagement, and checks for understanding), scored 1 through 5 from strongly disagree to strongly agree with equal weights. Two optional `TEXT` questions collect strengths and suggested improvements. These question-type strings are seed conventions for the future backend.

Cycle, template, and criterion IDs are stable. Reruns preserve existing edits to their records. Templates are not linked directly to cycles in the current schema; an assessment links to its template when created. No signups, observations, candidates, preferred dates, assessments, process feedback, or notifications are seeded.

## One-command local database setup

Configure `.env` from `.env.example`, then start PostgreSQL yourself using Docker Desktop or this command:

```sh
docker compose up -d --wait postgres
npm run db:setup
```

The setup script checks that PostgreSQL is reachable, applies checked-in migrations with `prisma migrate deploy`, checks schema consistency, and runs the seed. Run `npx prisma studio` afterward to inspect the records. The setup script never starts Docker or containers. If PostgreSQL is unavailable, it stops with instructions. The Next.js app is not required. You can rerun setup; applied migrations are skipped and seed IDs remain stable.

This command requires a local DATABASE_URL matching the Docker settings. It does not reset databases, adopt existing unmanaged tables, or erase volumes. An existing database with tables but no migration history needs a reviewed baseline; setup stops instead of resetting it. Future schema changes need new committed migrations before setup can apply them.

## Local generated files

Each developer runs setup against their own local PostgreSQL Docker volume. Database contents are outside the repository. `.env`, the generated Prisma client in `src/generated/prisma/`, and the generated `prisma/demo-accounts.txt` are ignored by Git. Keep schema, migrations, seed scripts and the shared synthetic source dataset in Git so everyone can reproduce the same demo accounts and roles locally.
