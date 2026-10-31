# Faculty dashboard backend and linked workflows

October 28 Issue #67 foundation: candidate membership is now list-scoped. Faculty
recommendation/request readers, dashboard counts, cycle scope, own alert context,
invitation actions, selection, late approvals and expiry/resends require the
observation's current released list and its publication. Draft/historical rows
remain preserved but cannot be acted on. Initial generate/release payloads remain
unchanged; replacement publication is disabled. Deploy the new recommendation-list
migration with all guarded readers/writers and pause the scheduler during rollout.
See AC_OBSERVER_SELECTION_BACKEND.md; no selected observer or assessment is migrated.

Updated October 26, 2026 on `Sai/faculty-dashboard-backend`. Preserves the Faculty
checkpoint/main integration, existing frontend design and teammates' configuration,
Admin and authentication services. History pages, navigation and APIs are excluded.
This supersedes the earlier preview and blocked-workflow notes.

## Complete within Faculty scope

- Own dashboard: evaluation, latest completion, active observation choices, pending
  invitations and five latest notifications, with explicit denied/unavailable states.
- Relevant cycles reuse configuration scope (teaching, signup, selected observer or
  candidacy), including AC/Admin acting as Faculty. A sole cycle is automatic;
  otherwise choose explicitly. Active observation selection supports both roles.
  HttpOnly same-site preferences are revalidated every time and never grant access.
- Eligibility, own sections, bounded calendar options and atomic signup with stored
  meeting instants/zone/location and existing one-signup-per-professor/cycle uniqueness.
- AC-authorized generation and idempotent release; own released lists, invitation
  sending, actual meeting acceptance/decline and atomic final pairing/cancellation.
- Retained invitation attempts, response-time expiry checks, compatible-meeting
  checks, notifications and prevention of concurrent overlapping final assignments.
- Faculty expired-acceptance requests, AC list/review APIs and new response windows.
  Approval never assigns an observer; superseded windows cannot be accepted.
- Explicit separate expiry/resend worker and scheduler, with no route-import timers.
- Published-template forms, observer drafts/submission, private draft answers,
  independent observee acknowledgement and atomic completion/locking. Actual rating
  options, required comments and stale revisions are enforced; templates stay assigned.
- Persisted non-occurrence reports, deduplicated committee alerts, participant
  process feedback and private supporting material with owner-only downloads.

## Documented working assumptions authorized for this task

1. **Eligibility:** current rank interval applies; rank history is unavailable.
   A hire date within/after the selected semester start excludes first-semester/future
   faculty. Earlier hire, teaching semester or completed evaluation establishes prior
   service. Established faculty without completed evaluations are Due for an initial
   evaluation. Missing all evidence stays Unknown and blocks signup. Not-due faculty
   can volunteer. Same-semester completion does not allow another signup.
2. **Calendar:** relevant cycles remain available through feedback deadline. No
   opening date is invented. Use configured semester boundaries and IANA zone/DST.
   Options start at today/semester start, include semester end, and precede the local
   observation-deadline date. Missing boundaries block dates. Exclude started classes,
   ambiguous multiple meetings, DST gaps/folds and expansions over 366 days. Faculty
   confirm class meets; no holiday exceptions or academic dates are fabricated.
3. **Matching:** after signup closes, use active faculty (signup is not required) in the same
   department teaching the same stored course level that semester, excluding self.
   Require a future compatible proposed meeting; select up to five by professor UUID.
   No invented scoring/capacity KPI. Recheck teaching and selected-appointment
   conflicts at sending, acceptance and final pairing. Multiple availability
   acceptances are allowed; overlapping final assignments are not. Generation does
   not release a list. Regeneration of released lists is outside this task.
4. **Windows/resends:** 48-hour initial/reopened windows are capped by observation
   deadline. Actions require server time before cutoff. Uncontacted compatible
   candidates precede expired candidates; automatically open at most a second window
   per candidate. Notify AC informationally. Explicit AC decisions can reopen the
   latest unsuperseded expired window. Serializable conflicts return 409 for explicit
   retry; browser mutations are not automatically retried.
5. **Assessment:** scheduled start through observation deadline. First save uses the
   latest published active template (publication time, UUID descending); existing
   assessments keep their assigned published template even if inactive. In-place
   edits follow the October 18 decision and change stale-write revisions. Observer
   submits first; observee cannot see drafts or edit ratings. Both acknowledge
   occurrence, not agreement. No amendment/withdrawal flow is introduced.
6. **Reports/feedback:** either assigned participant can report non-occurrence after
   appointment start and before any acknowledgement; it blocks assessment completion.
   Observee alerts accept free-text reason/details, once per reporter/observation/kind.
   Feedback opens after observation deadline through feedback deadline for actual
   observees/selected observers. Required satisfaction is 1–5, very dissatisfied to
   very satisfied; difficulties/suggestions are optional. Existing uniqueness allows
   one immutable response per observation/participant role. This is not a KPI formula.
7. **Evidence:** optional PDF/PNG/JPEG with signature/type checks, up to 5 MiB each,
   three uploads per participant/observation. Server UUID filenames, private storage,
   owner/observation validation and transactional feedback linking. Downloads are
   owner-only attachment/no-sniff/no-store responses. No AC individual-response
   access, retention purge or signed assessment upload is inferred.

## Live APIs

All `/api/me/dashboard` routes resolve current Auth.js database grants. POSTs require
same-origin JSON bounded to 256 KiB, except bounded multipart uploads. Success/errors
are private/no-store; no SQL, credentials or storage paths escape. Services also
check ownership, action grants, current state and deadlines.

| Route below `/api/me/dashboard` | Request |
| --- | --- |
| GET base; GET `/workflow` | Own summary; own schedules/signup/work/candidates/requests/feedback controls |
| POST `/cycle` | `{cycleId}`; verified relevant preference |
| POST `/observation` | `{observationId}`; verified active own preference |
| POST `/signup` | `{sectionId,dates:YYYY-MM-DD[]}` |
| POST `/invitations` | `{observationId,candidateIds:UUID[]}`; initial-send retries retain windows |
| POST `/requests/accept` | `{candidateId,attemptId,meetingOptionId}` |
| POST `/requests/decline` | `{candidateId,attemptId}` |
| POST `/requests/late-acceptance` | `{candidateId,attemptId,reason?}` |
| POST `/selected-observer` | `{candidateId}` |
| GET/POST `/assessment` | Current form; `{action:'save'|'acknowledge',revision,responses?,acknowledged?:true}` |
| POST `/issues` | `{observationId,kind:'ALERT'|'NOT_OCCURRED',reason,details}` |
| POST `/feedback` | `{observationId,satisfaction,difficulties,suggestions,attachmentIds?:UUID[]}` |
| POST `/feedback/attachments` | Multipart `observationId`, `file` |
| GET `/feedback/attachments/{attachmentId}` | Own private download |

Responses remain `{answers:{[criterionId]:number|string},comments:string,
promptAnswers?:{[promptId]:string}}`. Unknown existing formats are not overwritten.
Invitation/selection/late requests use their existing action grants. Feedback uses
`feedback.submit/read.own`; non-occurrence uses the participant's assessment submit/
acknowledge grant plus own profile/observation reads; alerts use the observee's
`invitations.send.own`. Per-section reads require their existing own read grants.

AC support, without new AC UI: POST `/api/evaluation-cycles/{cycleId}/recommendations/generate`
with `{}` requires `recommendations.generate`, returning generationId. POST sibling
`/release` takes `{generationId,observationIds?}` and `recommendations.release`.
GET `/api/evaluation-cycles/{cycleId}/expired-acceptance-requests` and PATCH
`/api/expired-acceptance-requests/{requestId}` with `{decision:'approved'|'rejected'}`
require `late-acceptance.review`. Committee notifications reuse Admin permission
inheritance. Other generic draft endpoint families are not claimed implemented.

## Setup and verification

`20261026000000_faculty_workflows` adds workflow/release markers, meeting snapshots,
accepted options, attempts, approvals, Faculty issues and attachment metadata.
Valid old windows are retained as attempt 1; users, records, answers and template
links are preserved. It is deployed locally without reset/reseed. Before/after
application counts: 539 users, 0 signups, 0 observations, 0 assessments.
Fall 2026 boundaries are still null: AC must enter actual semester dates first.

```text
npm.cmd run db:generate
node --test tests/unit/*.test.mjs
node --env-file-if-exists=.env --env-file-if-exists=.env.local tests/integration/faculty-populated.mjs
npx.cmd prisma validate
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run build
```

Populated tests require local PostgreSQL CREATE DATABASE permission. They create/drop
only a UUID-named `faculty_test_*` database, apply all migrations there, and use a
checked temporary directory for evidence. Actual services/Prisma/SQL run on real
tables; only request identity/context and database transports are substituted.
Coverage includes migration retention, eligibility, cycle choice, populated screen
rendering, ownership/grants/origin, deadlines, release privacy, attempts, concurrent
signup/acceptance/pairing across observations, AC decision races, resends, reporting,
drafts/finalization, feedback and attachment validation/linking. No History requests.

Earlier integration verification (before the weekly progress pass): 153 unit tests passed; the optional SQL-plan-only test was
skipped because the populated suite executes actual SQL. All 15 populated isolated
PostgreSQL check groups passed, as did the seeded live Faculty workflow HTTP check,
lint, explicit TypeScript check, Prisma validation/status, production build and diff
whitespace checks. Runtime upload paths are excluded from deployment file tracing.
No application fixtures were inserted. The dev server was restarted after client
generation and is running on localhost:3000; the separate scheduler is also running.

Run `npm.cmd run jobs:faculty` as a separate process for five-minute expiry checks.
One-shot: `node --import ./scripts/server-loader.mjs --env-file-if-exists=.env
scripts/faculty-invitations.ts`. Evidence defaults to ignored private directory
`.local/private-faculty-attachments`; `FACULTY_ATTACHMENT_DIR` can configure private
deployment storage, which must be backed up with metadata.

Operational prerequisites: actual semester dates and adequate faculty profile evidence.
For future deployments/restarts, restart after generated-client changes and run the
separate scheduler as well as Next.js.
AC generation/release/review UI, AC issue resolution, email, reporting/KPI formulas
and retention administration are separate project work. History and manual observer
replacement remain outside scope.

## Weekly progress handoff — October 26, 2026

The core implementation above is retained on `Sai/faculty-dashboard-backend`.
This pass adds focused service regression coverage, without changing application
code, UI, History, schema or database records. It checks permissions before opening
a transaction, invitation ownership/current-window rejection, decline updates to
both candidate and attempt, and release retry notification deduplication. Tests
execute the services with substituted persistence; they do not prove transaction
rollback or concurrent database behavior.

Weekly validation: 33 focused tests passed and one optional database SQL-plan test
was skipped. Lint and TypeScript passed. Run the focused suite with:

```text
node --test tests/unit/faculty-dashboard.test.mjs tests/unit/faculty-workflow.test.mjs tests/unit/faculty-database.test.mjs tests/unit/faculty-invitations.test.mjs
```

End-to-end, populated database, concurrency, production build and deployment checks
were not rerun in this pass, as requested. Earlier results above are historical
evidence, not fresh verification of this handoff. Scheduler continuity, real email
delivery and deployed private-storage persistence are not verified here.

Remaining integration work: AC must configure real semester boundaries and resolve
profiles with insufficient eligibility evidence. No reset/reseed is needed; other
environments must deploy the additive migration and regenerate Prisma. Deploy the
expiry scheduler alongside the app and provision durable private attachment storage.
AC consumers still need to connect generation/release/review APIs to their UI.
The documented matching order, retry cap, missing-evidence treatment and eligibility
edge cases remain working assumptions for team confirmation; they are not newly
approved policy. Annual/biennial frequency, signup deadlines, automatic resend and
expired-invitation approval are existing repo requirements, not open decisions.


October 28 signup navigation: the signup route redirects to current observation
details when the authorized selected-cycle workflow already contains a signup.
The form also guards against displaying another submission for an existing signup,
and successful signup replaces the page with observation details. My Evaluation
and Observations switch their signup link to View Observation Details when signed
up. Existing database uniqueness, transaction locks and duplicate API rejection
remain enforced. This does not block signup for another cycle.


October 28 dashboard previews and evaluation display:
Recent activity normalizes whitespace and truncates messages at 180 Unicode
characters, with a two-line visual limit and a Notifications link for full text.
My Evaluation displays Signed up for an existing selected-cycle signup, and
Completed when the latest completed evaluation belongs to the selected semester.
Signing up is not completion; annual/biennial due calculations, AC reporting and
backend eligibility rules are unchanged. The UI explains pending completion.


October 28 dashboard signup status correction:
Dashboard now reads hasCurrentSignup through Prisma for the signed-in faculty
member and selected cycle under signups.read.own. Dashboard and My Evaluation
share the same Signed up / Completed / requirement-label display helper. The
dashboard signup shortcut also becomes View Observation Details after signup.
Observer participation alone never implies an own signup, and a missing grant or
cycle is not treated as an unsigned state. Eligibility/due rules are unchanged.
