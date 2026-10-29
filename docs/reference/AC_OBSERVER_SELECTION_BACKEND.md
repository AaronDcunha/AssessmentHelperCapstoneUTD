# AC observer selection backend: Issue #67 signup read

Only `GET /api/evaluation-cycles/{cycleId}/signups` is implemented by this change.
Existing generation/release services are unchanged; regeneration and the dedicated
candidate endpoint remain separate work pending the recorded team decisions.

## Authorization and scope

The route uses `checkApiPermission("signups.read")`, resolving current active
Auth.js account/effective grants. The query independently checks that exact grant.
AC/Admin role names, `test:*` permissions, Faculty participation and own-read grants
do not substitute for it. No grants are added. Custom effective grants follow the
existing permission model rather than introducing a new role-name restriction.

University-wide reads are a **provisional implementation assumption**, following
current AC reporting. `departmentId` and `hiringLevelId` filter the observee's
Professor profile, not the course's department. No deadline or account-activity
filter removes historical signups from the authorized result.

## Response and validation

See the completed signup GET entry in `AssessmentHelper_API_Contract_Draft_v2.txt`.
The envelope is `{items,pageInfo:{nextCursor,hasMore}}`. Each item preserves the
draft's signupId, observationId, observee, section, proposedMeetings and signedUpAt,
adding observationRevision, recommendationGenerationId and recommendationsReleasedAt.
These are raw persisted observation markers, not derived match states. Observee
identity uses AppUser UUID/name/email. No credentials or candidate records are read.

Meetings retain the persisted ObservationTimeOption UUID/date/start/end/zone/location.
Missing snapshot metadata stays null, even when the current class schedule exists;
no availability or candidate compatibility claim is made. Section.meetings contains
the current stored class schedule using its semester's stored time zone.

No observation returns null observation identity/revision/generation/release fields
and empty proposedMeetings. Multiple observations return 409 AMBIGUOUS_OBSERVATION:
the schema permits many, but the existing signup writer creates one. This safeguard
is provisional; a future multi-observation contract requires an explicit decision.

Filters: departmentId, hiringLevelId, q, cursor, limit. Search is case-insensitive
observee name/email, course code/title or section code, limited to 200 characters.
Only one nonempty value per allowed key is accepted. Limit defaults to 20, maximum
100; ascending signup UUID pagination validates the cursor against the same cycle
and filters. Cross-cycle or filtered-out anchors return 400 without foreign details.

Existing empty cycles return 200 with an empty list; missing cycles return 404.
Malformed UUID/limit uses shared configuration validation (422); invalid query
shape/search/cursor membership returns 400. Authentication/permission failures use
401/403; dependency failures use sanitized 503. All responses, including failures,
use structured errors and Cache-Control: private, no-store.

## Source placement and checks

- `src/server/queries/cycle-signups.ts`: authorized Prisma selection/mapping.
- `src/app/api/evaluation-cycles/[cycleId]/signups/route.ts`: thin private HTTP read.
- `tests/unit/cycle-signups.test.mjs`: query/HTTP, validation, privacy and safeguards.
- `tests/integration/cycle-signups.mjs`: disposable local PostgreSQL schema verifying
  actual cycle/filter/cursor isolation, pagination, snapshots and observation edges.

Focused unit checks:
`node --test tests/unit/cycle-signups.test.mjs tests/unit/database-auth-prisma.test.mjs tests/unit/personal-observations.test.mjs`

Integration (requires local PostgreSQL and generated Prisma client):
`node --env-file-if-exists=.env --env-file-if-exists=.env.local tests/integration/cycle-signups.mjs`

The integration applies existing migrations only inside its disposable schema and
removes that schema afterward. It does not migrate, reset or seed application data.
Run TypeScript with `--noEmit --incremental false` and the existing ESLint script.

Verified October 28, 2026: all 14 focused unit tests passed (8 new signup tests plus
authentication/personal-read regressions), the disposable PostgreSQL integration
passed, TypeScript passed and repository-wide `npm run lint` passed. The first
TypeScript run found an outdated ignored generated Prisma client missing fields
already present in main; `npm run db:generate` refreshed it from the unchanged
schema, after which TypeScript passed. No application migration/reset/seed, build,
commit or push was performed. The integration's disposable schema was removed.
