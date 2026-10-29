# AC observer selection backend: Issue #67 reads

Implemented reads: `GET /api/evaluation-cycles/{cycleId}/signups` and Phase 1
`GET /api/observations/{observationId}/candidates`. Existing generation/release
services are unchanged. Regeneration and new Faculty candidate-list access remain
separate work pending the recorded team decisions.

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

## Candidates Phase 1: AC review of the current single list

The new route and `src/server/queries/observation-candidates.ts` require the exact
effective observations.read grant. This is already the broad observation-detail
permission in queries/ac-reports.ts. University-wide scope remains provisional.
Role labels and Faculty own/released-own permissions do not grant access, even
when the caller owns the signup, is a candidate/observer, or the list is released.
This deliberately introduces no new Faculty-facing access or navigation behavior.

The endpoint reads existing candidates; it never selects any new observers, limits
the persisted list to five, releases recommendations, expires invitations or sends
notifications. The HTTP adapter uses one RepeatableRead transaction. The query
reuses workflowObservation, availableOption and observerAvailable without changing
their behavior. Internal workflow records (including form data) are never serialized;
the DTO explicitly selects identity, response, meeting and teaching fields.

The endpoint-specific API draft entry is authoritative for this partial contract:

- status is the candidate's raw recorded combined state. responseStatus is the
  latest actual InvitationAttempt.status, or null if no attempt exists. outcome
  copies SELECTED/CANCELLED only; otherwise null. No earlier responses are guessed.
- activeAttempt means the latest actual window, not necessarily an actionable one.
  It includes ID, sequence, actual invitation/expiry/response timestamps and status.
  Per-attempt accepted meeting is omitted because it is not stored. The candidate's
  acceptedMeetingOptionId remains separate and must belong to the observation.
- Pending attempts remain recorded PENDING even after wall-clock expiry; this GET
  does not substitute EXPIRED or write state. Response mutations still enforce time.
- responseStatus filters the latest recorded attempt before pagination; superseded
  matches are excluded. It accepts exact uppercase stored strings rather than
  inventing an agreed enum. Candidates with no attempts have a null response.
- courseHistory contains up to five recent same-level course/semester records from
  Teaches, including older semesters as Aaron clarified. Deduplicate by course UUID
  and semester UUID before limiting; repeated sections do not consume entries.
  Order newest semester first using stored YYs/YYu/YYf termCode (year, then Spring,
  Summer, Fall), followed by ascending course code, course UUID and semester UUID.
  Unrecognized legacy term codes sort last using those deterministic ties, without
  guessing chronology from display names or nullable semester boundaries. The DTO
  stays `{course:{id,code,title,departmentId,level},semester:{id,name}}` per entry.
  Other levels remain excluded. Historical display does not change eligibility or
  availability: observerAvailable still requires current-cycle-semester same-level
  teaching, same professor department and the existing conflict checks. Course
  department metadata adds no new department eligibility restriction.
- proposedMeetings retains persisted UUID/date/snapshot values, including nulls.
  availableMeetingOptionIds uses the existing live compatibility checks. Legacy
  schedule resolution may establish compatibility while snapshot values stay null.
- generationId/releasedAt map existing observation markers. No view/generation
  selector is accepted; no separate current draft or last released list is claimed.

Pagination is ascending candidate UUID, default 20/max 100. Cursor membership is
validated against the same observation/latest-response filter. Only the small
single-observation state rows are scanned before paging detailed records; broader
historical list pagination is outside this phase. All responses use private,
no-store and structured errors following the signup read. Missing observations
return 404; inconsistent cycle/section or accepted-option ownership returns 409.

Aaron's relayed decisions supersede older conflicting UC3 requirements: the process
explanation takes priority, eligibility uses the cycle's current semester for now,
and any five eligible observers are acceptable. Relevant-course display is separate
from eligibility. Regeneration after release/invitations remains required later;
draft/released membership, invitation survival and final DTO enums still need work.
No schema/migration, dependency, grant, Faculty reader or worker change is included.

Focused checks:
`node --test tests/unit/observation-candidates.test.mjs tests/unit/cycle-signups.test.mjs tests/unit/faculty-invitations.test.mjs tests/unit/database-auth-prisma.test.mjs tests/unit/personal-observations.test.mjs tests/unit/faculty-workflow.test.mjs`

Database check:
`node --env-file-if-exists=.env --env-file-if-exists=.env.local tests/integration/observation-candidates.mjs`

This creates a disposable schema, runs the actual query in PostgreSQL READ ONLY
transactions and compares candidate/observation/attempt/notification state before
and after. It also verifies observation isolation, historical course/semester
ordering across years and Spring/Summer/Fall, section deduplication before the
five-entry history limit, and rejection of historical-only teaching as evidence
of current-semester compatibility. Real shared meeting checks and closed-window
response mapping remain covered.

Updated history verification: all 11 candidate unit tests passed. The focused
suite (including Faculty workflow regressions) passed 44 tests with one optional
database-plan test skipped. Candidates READ ONLY PostgreSQL integration and the
existing signup PostgreSQL integration passed; TypeScript and repository-wide
ESLint passed. Native Node tests emit existing module-type warnings. The candidate
integration also emits a nonfatal pg concurrent-query deprecation traced to Prisma
client/adapter execution; no dependency or workflow change was made to address it.
All disposable schemas are removed. This verification does not exercise a live
browser, production build or any deferred regeneration/Faculty-access behavior.
