# AC observer selection backend: Issue #67

Implemented: GET Signups, GET Candidates, initial generation, draft regeneration,
and individual/selected/all publication, including safe replacement after selection.
Existing Faculty reads/actions remain independently authorized and current-release
scoped; the AC Candidates route does not introduce new Faculty access.

## Completed replacement lifecycle (October 30, 2026)

This section supersedes the historical disabled-workflow notes below. Generate uses
the existing optional scope (including selected observation IDs); initial generation
skips previously published/paired/assessment-started observations. Regenerate uses
the separate observation route, exact `recommendations.regenerate` grant, required
UUID `requestKey` and `expectedRevision`. It creates a new list and independent
candidate UUIDs without cancelling the current release or changing any assignment.
Matching is unchanged: current-cycle-semester teaching, same department/course
level, all active faculty regardless of signup, compatible meetings, exclude self, up to five.
Under-five and zero-match lists produce AC notifications keyed by list UUID.

Publish uses `recommendations.release` and `{requestKey,targets,all?}`. Each target
is `{observationId,listId,expectedRevision,expectedReleasedListId?}`. The frontend
sends the released-list UUID or null. One target publishes one observation; many
targets publish one atomic batch across arbitrary draft generations. `all:true`
also verifies targets exactly match every eligible current unpublished draft in
the cycle; additions/changes require refresh rather than publishing unseen data.
An empty all manifest is a harmless no-op. Publication requires signup closed,
observation deadline open, PENDING/CONFIRMED state and no assessment row whatsoever.
Imported drafts with invitation/response/cancellation history cannot be published.
The legacy `{generationId,observationIds?}` payload remains initial-only.

Every new mutation uses a Serializable transaction and observation revision fence.
`RecommendationOperation` stores the actor, scope, kind, canonical request hash and
JSON result under a UUID request key. Identical retries return the original result,
without more lists/notifications/history. Different payload/actor reuse returns
409. A serialization/unique race without a committed receipt returns 503; retry
the identical key/payload. The UI retains that operation until a definite outcome.

Replacement publication switches the pointer, clears the draft, cancels old
memberships and outstanding attempts, archives any selected observer assignment,
clears its live pairing/schedule, and queues notifications in the SAME transaction.
Recorded acceptances/declines, response dates, accepted option UUIDs, approval
decisions, previous cancellation times and original candidate IDs are preserved.
Pending attempts become CANCELLED without a fabricated respondedAt. Cancellation
metadata is separate from terminal response status. Old IDs cannot send, respond,
request/approve late acceptance or select; workers/readers retain their pointer
guards. Previously queued mail may still arrive, but its superseded IDs cannot act.

`ObservationAssignmentHistory` snapshots the real pairing, schedule, known selected
candidate/meeting, actor/time and replacement event. New selections record actor/
time; unknown legacy values stay null. `InvitationAttempt.acceptedOptionId` records
future acceptances per attempt; legacy nulls are never inferred from current state.
Any assessment row, partial signature, lock, completion, closure or passed deadline
blocks regeneration/publication. Starting assessment work concurrently shares the
existing observation revision fence, so neither transition can overwrite the other.

Migration `20261030000000_recommendation_publication` is additive: two audit/receipt
tables and nullable selection/cancellation/attempt-option columns. It rewrites no
existing data and invents no earlier assignments or generations. Existing explicit
permanent semester deletion removes its dependent audit/receipt rows transactionally;
ordinary recommendation operations never delete history. Deploy migration, app and
workers together with the Faculty scheduler paused; no reset/reseed is required.
Run `npx.cmd prisma migrate deploy` against the intended development deployment only
after reviewing its pending migrations, then `npm.cmd run db:generate` and restart
app/workers. This implementation does not migrate the configured application DB.

AC Candidates still defaults to draft then current release, supports explicit
observation-owned listId, pinned pagination/response filters and five recent
distinct relevant course/semester pairs including older terms. Nullable metadata
stays null. `allowedActions:{regenerate,publish}` gates the frontend; attempt DTOs
now include nullable cancelledAt, acceptedMeetingOptionId and supersededByListId.
Signups is unchanged. Frontend actions: Generate Selected, Regenerate in review,
Publish One, Publish Selected and Publish All Eligible, with replacement warnings.

Verification: `node --test tests/unit/*.test.mjs`; Prisma validate/generate, Next
typegen, TypeScript and ESLint. PostgreSQL tests must use an external env file whose
DATABASE_URL points to disposable local PostgreSQL, e.g.
`node --env-file=C:\\path\\isolated.env tests/integration/recommendation-lifecycle.mjs`.
That suite creates/drops its own uniquely named DB and covers draft A/B isolation,
post-selection regeneration, preserved responses/approvals/assignment, single and
mixed-generation atomic publication, rollback, stale manifests/revisions, concurrent
same-key retries and assessment protection. recommendation-migration.mjs verifies
legacy preservation through both migrations. Existing Faculty, Candidates, Signups,
Alerts, Personal Observations, KPI and Admin suites remain regression checks.

Demo after coordinated development migration: `npm.cmd run dev`, then
`http://localhost:3000/ac/observer-selection` as an authorized AC account. Select
signups after signup closes, Generate, review and Publish One/All; as the observee,
use `http://localhost:3000/observations/recommendations` to invite/select and
`http://localhost:3000/observations/requests` as the invited observer to accept. Regenerate
in AC review: the old Faculty list/pairing stays active until explicit publication.
Email delivery is optional for this demo: `npm.cmd run jobs:email` drains the queue;
in-app notifications are committed immediately. No dev/email worker is auto-started.

## October 30 integration with main 2edbfb4

The Task 1 frontend uses these canonical GET routes and authorized queries. The
duplicate observer-selection-api/queries/observer-selection adapters were removed.
Generation accepts main's optional scope.observationIds (1–500), departmentId and
professorIds, retaining all initial-only/list-preservation checks. An unavailable
selected observation rejects the whole request before writes. Release payloads
remain unchanged; each selected row supplies its own real generation identifier.
Faculty Prisma queries, transaction-scoped reads, accepted meeting display and
assessment workflowRevision coordination from main remain intact.

The frontend handles absent observations, nullable meeting snapshots, courseHistory
arrays, separate recorded candidate/response states and current list identities.
Candidate pagination is pinned to the first resolved list. Regeneration controls
remain disabled because no regenerate route exists; permissions do not enable an
unavailable capability. Replacement generation/publication is still disabled.

KPI calculations select current draft, otherwise current published membership;
survey evidence uses only the current published list. Archived/abandoned candidate
rows are preserved and excluded. The existing explicit permanent-semester-delete
operation clears pointers and deletes lists after candidates, before observations,
within the same authorized/revision-checked transaction. Its confirmation describes
history deletion; ordinary recommendation workflows retain all history.

Integration verification: Prisma validation/generation, Next route type generation,
TypeScript, repository-wide ESLint and 287 unit tests pass. PostgreSQL suites run
only in a disposable PostgreSQL 18 container: migration/backfill, populated Faculty
(19 groups), Candidates, Signups, Alerts/Reminders, Personal Observations, KPI and
Admin. No application database migrations or shared-environment seed commands run.
Earlier local deployment/verification notes below describe the preceding slice.

## Recommendation-list foundation (October 28, 2026)

`RecommendationList` stores list/observation UUIDs, nullable generation UUID/time
and publication time, origin and recordedAt. recordedAt is creation/import time;
unknown historical generation time remains null. `Observation` has independent
currentDraftListId/currentReleasedListId. Composite foreign keys prevent pointers
and candidates from crossing observations. Candidate uniqueness is now list plus
professor, allowing independent candidate IDs for the same person across lists.
Existing attempts/approvals still reference their original candidate IDs.

`20261028040000_recommendation_lists` imports one surviving set per observation
with candidates or generation/release markers, using the observation UUID as its
new import-list identity. It does not assert this was a historical generation UUID.
Only an existing release timestamp establishes publication/current release. A
generation marker without release establishes a draft. Candidate-only sets remain
unpointed imports for explicit AC review, never inferred releases. Known empty
generated/released lists are included. Existing rows, states, timestamps, final
selections and assessments are preserved. No earlier lost lists are reconstructed.

Initial generation still uses current-semester matching and the existing pool/
compatibility checks. Re-running before release creates a fresh current draft,
retaining the older draft and its candidate IDs. Generation skips released,
selected, completed and assessment-started observations. Initial release atomically
publishes the current draft, moves the pointer, clears the draft pointer, updates
the legacy release timestamp and queues a shared-service notification keyed by
observation and list UUID. The existing {generationId,observationIds?} contract and
Serializable/revision conflict handling remain. An unchanged release retry does
not notify again. Replacement release returns 409. Imported drafts with invitation
or response history require review rather than silently becoming actionable.

All Faculty candidate authorization uses the current released pointer AND a real
list publication. `src/server/recommendation-scope.ts` supplies Prisma, pg and
mutation guards. Faculty recommendations/requests/counts, candidate-derived cycle
access, own alert context, invitation sends/responses/selection, late approvals
and expiry/resends exclude drafts and historical lists. Final selection cancels
only other members of its own current release. The older decline export now
delegates to the canonical guarded Prisma action. No grants, matching rules,
meeting UUIDs or null handling changed.

AC Candidates accepts optional listId (must belong to the observation); default
is draft then released. Pagination/cursors and response filters apply within that
list. Imported unpointed sets can be reviewed explicitly. The response adds both
current pointer IDs and list:{id,generationId,generatedAt,publishedAt,origin}|null.
Legacy top-level generationId/releasedAt remain raw observation markers, so use
list metadata when displaying an explicitly selected historical list. Signups
adds nullable currentDraftListId/currentReleasedListId. These GETs remain read-only
and independently authorized; no new Faculty access is introduced.

Deployment: pause the Faculty scheduler and coordinate application/worker rollout.
Run `npx prisma migrate deploy` and `npm run db:generate` before starting the updated
application and scheduler. Old binaries cannot safely write list-less candidates;
do not mix old writers with the new schema. No database reset/reseed is needed.
This implementation tests upgrades in disposable PostgreSQL schemas/databases;
it does not deploy the migration to the application database automatically.
Read-only local deployment inspection found seven pending migrations, beginning
with 20261026000000_faculty_workflows and including this foundation. The configured
application database therefore needs the earlier migrations as well; integration
success below is against fully migrated disposable databases, not that database.

Checks: recommendation-migration.mjs verifies exact legacy record preservation,
unknown metadata, empty/unclassified lists, uniqueness and ownership constraints.
faculty-populated.mjs covers preserved drafts, atomic batch rollback, release
retries, every mutation fence, hidden requests/counts/cycle scope, unchanged
historical attempts/approvals during expiry and selection, and existing Faculty
workflows. Candidates integration uses PostgreSQL READ ONLY transactions and
fingerprints lists as well as workflow/notification records. Signups, Alerts and
personal-observation integrations remain covered. Focused unit tests cover history
selectors/cursors, authorization and disabled replacement publication.

Verification for this foundation: Prisma validation/generation, TypeScript and
repository-wide ESLint passed. The full unit suite passed 264 tests with one
optional database-plan test skipped. All six isolated PostgreSQL suites passed:
recommendation-migration, faculty-populated (16 groups), observation-candidates,
cycle-signups, alerts-reminders and personal-observations. Application data was
not migrated or seeded. Existing Node module-type/pg deprecation warnings remain.

An additional whole-schema diff inspection flags pre-existing FK update-action
differences from 20261026000000_faculty_workflows: faculty_issue (observation,
reporter), feedback_attachment (owner, observation, feedback), invitation_attempt
(candidate), late_acceptance_approval (attempt), observation_candidate (accepted
option). That SQL defaults to ON UPDATE NO ACTION while the existing Prisma
relations default to CASCADE. This migration changes none of those constraints.
The new four ownership/pointer FKs explicitly use NO ACTION/RESTRICT and are checked
against pg_constraint. Keep the older drift out of this migration; review it before
relying on a successful whole-schema drift gate such as db:setup.

Future work: enable replacement generation/publication only after implementing
operation idempotency, publication cancellation and assignment archival. Aaron
approved archiving/reopening a selected observation only before assessment work
starts. Existing signed, partially signed, completed or closed observations must
not be overwritten. Manual observer addition remains out of scope.

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
- generationId/releasedAt map legacy observation markers. The foundation adds
  explicit list metadata and current draft/released pointers; listId selects one
  observation-owned list. No view or generationId query selector is accepted.

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
