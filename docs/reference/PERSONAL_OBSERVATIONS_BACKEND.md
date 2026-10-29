# Personal observation reads

`GET /api/me/observations` is implemented against Prisma/PostgreSQL. It is shared
by History and available to Dashboard and active Observations; it is not a separate
History API and does not select an implicit current cycle or completion status.
Existing Dashboard/workflow aggregates are unchanged in this endpoint-only pass.

Authorization requires an active account/session and `observations.read.own`.
Every query restricts ownership through the signup professor's AppUser ID or the
selected observer's AppUser ID. AC/Admin broad grants never widen `/me` scope.
Being an observer candidate (even accepted) does not grant membership. An account
without participating records receives an empty list. Reserved demo identities
receive no generated records. Real accounts use the database in every environment;
`AUTH_DEMO_ENABLED` is not a database-read feature flag.

Filters intersect:

- `cycleId`, `semesterId`: UUIDs; semester matches the observation's cycle.
- `participation`: `observer` or `observee`; omitted includes both.
- `status`: exact stored uppercase status; no new lifecycle enum is introduced.
- `assessmentStatus`: `NOT_STARTED` (no assessment), `IN_PROGRESS` (unlocked),
  `COMPLETED` (locked). These match existing AC list categories, including an
  observer-submitted but not yet finalized form in `IN_PROGRESS`.
- `limit`: defaults to 20, range 1–100. `cursor`: prior last observation UUID.

Unknown, empty and repeated parameters are rejected with 400 `INVALID_QUERY`.
Pagination orders by observation UUID ascending, fetching limit+1 records. Cursors
are validated against the same caller and filters before applying the keyset bound;
foreign, missing, and filtered-out cursors share the same generic error. No list
count, foreign record lookup, or caller-supplied identity override is exposed.

Responses use `{items,pageInfo:{hasMore,nextCursor}}` and the common Observation
shape: section/course/weekly meetings, nested semester label for History,
participant user summaries (no emails), participation, status, assessment state,
revision and allowed view action. `scheduledAt`/`completedAt` are additive UTC
fields consistent with existing reads. Answers, invitations, credentials, and
other private workflow internals are not selected.

A scheduled meeting is returned only when a stored dated option with complete
start/end/time-zone metadata matches the scheduled start. Legacy incomplete
appointment metadata returns null plus an unavailable reason; no end time or
location is inferred. `occurred` is true when completion is stored, otherwise
null; missing completion is not evidence of non-occurrence. `revision` is the
stored workflow revision. This endpoint does not invent mutation actions.

All responses, including failures, use `Cache-Control: private, no-store`.
Errors use `{error:{code,message}}`: 401/403 for access, 400 for query validation,
and 503 `UNAVAILABLE` for persistence failures without raw database details.
No schema, migration, seed, auth, or workflow mutation changes are required.

Verification:

- `node --test tests/unit/personal-observations.test.mjs`
- `node --env-file-if-exists=.env --env-file-if-exists=.env.local tests/integration/personal-observations.mjs`
  uses local PostgreSQL only, applies migrations to a unique disposable schema,
  and removes that schema in finally; application tables are untouched.
- `TEST_BASE_URL=http://localhost:3000 node tests/integration/history-page.mjs`
  against a development server with reserved demo login enabled verifies access,
  empty mock-account reads, no-store, rejected identity overrides, and logout.

The inherited full production typecheck is separately blocked by optional route
context signatures in the existing Admin/AC wrappers; this endpoint does not use
those wrappers.

Validation completed: 204 unit tests passed with one existing skip; isolated
PostgreSQL integration and local History HTTP integration passed; lint passed.
Source TypeScript checking excluding inherited generated route validators passed
with zero diagnostics. Full tsc still reports the documented existing Admin/AC
optional route-context errors. No application records were added or changed.
