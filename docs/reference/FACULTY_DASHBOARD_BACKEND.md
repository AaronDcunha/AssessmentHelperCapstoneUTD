# Faculty dashboard backend

The dashboard reads local PostgreSQL through the existing parameterized `pg` pool and actual Prisma-managed schema. No generated Prisma client, dependencies, migrations, seeding, or resets are needed. The subsequent user-approved scope includes linked Faculty workflows; History and its navigation remain excluded and unchanged.

`src/server/queries/faculty-dashboard.ts` is a server-only read shared by the Server Component `/dashboard` and **GET `/api/me/dashboard`**. This aggregate is a narrow addition to the prototype API draft, not an implementation of the proposed evaluation-status, observations, notifications, History, or mutation APIs. The page queries directly rather than fetching its own API.

## Access and privacy

- Existing Auth.js helpers resolve the caller. The query requires `profile.read.own`. Browser user/professor IDs, roles, filters, and clock values are not accepted as inputs; extra API query parameters are ignored.
- Evaluation details require `evaluation-status.read.own`; observations/count require `observations.read.own`; activity requires `notifications.read.own`. Denied sections do not execute private reads. Denied counts are null/unavailable, not zero. Role labels do not grant access.
- The account UUID resolves to its distinct professor UUID. Evaluation is only for the caller's Observee signups. Current work must name them as Observee or selected Observer. Invitations use the invited professor, notifications the account UUID. Admin still sees only their own records.
- Reserved development identities have no database UUID/profile and return unknown/empty data, without mapping to seeded accounts or adding permissions.
- No cross-request data cache is used. Page/API are dynamic. API success, 401, 403 and 503 responses are `private, no-store`; dynamic page responses also have no-store. Errors expose no SQL, credentials or partial results. Read failures display Unavailable rather than a false zero or empty history.

## Provisional display assumptions

These choices summarize existing records; they do not authorize signup or implement lifecycle transitions.

1. **Current cycle:** require ordered signup/observation/feedback deadlines and feedback deadline at or after server time. Choose earliest observation deadline, latest signup deadline, then UUID. No expired-cycle fallback. The schema has no opening date, semester boundaries or active flag, so a future cycle can be selected if it is the only qualifying one. No dates/records are invented.
2. **Last evaluation:** latest own Observee assessment that is locked and signed by both participants. Completion time is assessment `completed_at`, then observation `completed_at`, then the later signature. Unlocked/one-signature assessments and observing another professor do not count.
3. **Evaluation status:** compare last completed semester plus the current configured rank interval with the current cycle semester, using seed term codes `YYs`, `YYu`, `YYf`. Equal is Due; later is Overdue; earlier is Not due. Current rank is used because rank history is absent. Missing history/interval/semester/cycle/profile, invalid data or future completion semester gives Unknown. Seeded null hire dates do not imply Due. First-semester and missing-history signup eligibility remain unresolved; this display never authorizes signup.
4. **Current observation:** unfinished, noncancelled work in the selected cycle; prefer own Observee work, then selected-Observer work. Choose earliest scheduled meeting (unscheduled last), latest signup, then UUID. Exclude completed timestamps, locked/both-signed assessments, and case-insensitive `COMPLETED`, `CANCELLED`, `CANCELED` statuses. Other stored statuses are displayed without inventing transitions. Candidate acceptance is not final assignment.
5. **Pending requests:** current-cycle `PENDING` candidates invited by server time, unanswered, with expiry and observation deadline strictly after server time, no selected Observer, and no completed/cancelled/finalized observation. Exclude self-invitations. Use actual stored windows, without inventing resend/48-hour/approval behavior.
6. **Activity:** latest five own notifications, ordered by timestamp descending then UUID. No synthetic events or guessed links (the schema has no target reference). API timestamps are UTC ISO; page dates use America/Chicago.

The seed contains profiles/courses and a Fall 2026 cycle but no observations, assessments, invitations or notifications. Expected initial display: Unknown evaluation, None recorded for last evaluation, No current observation, 0 pending, No recent activity. The hardcoded dashboard semester subtitle is removed; selected real cycle context is in the API response and drives status/current-work reads. Layout, three buttons, and destinations are preserved.

## Checks

```text
npm run lint
npx tsc --noEmit --incremental false
node --test tests/unit/*.test.mjs
npm run build
```

Against a running seeded app (optional TEST_BASE_URL for a different local port):

```text
node tests/integration/database-auth.mjs
node --env-file-if-exists=.env --env-file-if-exists=.env.local tests/integration/faculty-dashboard.mjs
```

For a local production check, start the app with a process-only trusted loopback host setting, for example in PowerShell: `$env:AUTH_TRUST_HOST='true'; npm run start -- --hostname 127.0.0.1 --port 3107`. Set `TEST_BASE_URL` to `http://127.0.0.1:3107` when running the checks against that instance. This does not change the authentication implementation or environment files; deployed host trust remains a deployment configuration decision.

Integration checks create authentication sessions only, never business records. Unit fixtures exercise populated summaries and access/error branches. Live integration covers the existing seeded database and own-account scoping; no populated workflow fixtures are inserted into PostgreSQL.

## Linked Faculty workflow follow-up

The user explicitly included linked Faculty workflows and selected **separate participant acknowledgements, then lock**. Earlier frontend-preview limitations are superseded for these reads/actions only:

| Existing screen/control | Implemented backend and wiring |
| --- | --- |
| My Evaluation | Actual status, rank, last evaluation, semester and cycle deadlines from the authorized dashboard query. |
| Course/section dropdown | Only the signed-in professor's teaching assignments in the selected cycle's semester; identifiers, wording and meeting rows come from PostgreSQL. |
| Signup calendar and review | Weekly recurrence from server today until before the local observation-deadline date, America/Chicago. Exclude already-started meetings today, invalid schedules and dates with multiple meetings. No semester boundaries or holiday exceptions exist, so the UI identifies this as the stored weekly schedule and asks faculty to confirm class meets. Expansion beyond 366 days fails closed as a resource guard. |
| Submit Signup | Revalidate own section, current cycle, schedule options, signup deadline and eligibility. Lock profile/cycle/assignment/schedule; atomically insert signup, pending observation and date options. Respect the existing one-signup-per-cycle constraint. Missing-history/first-semester eligibility remains blocked pending agreement; a prior-semester completed evaluation is the conservative prerequisite. |
| Current observations/details/appointment | Actual own current-cycle participation, names, section, status, scheduled time, persisted proposed dates and matching schedule location. Show location only for one matching weekday/start-time meeting. No arbitrary record IDs or past-record browsing endpoints are added. |
| Pending requests and Decline | Actual unexpired/unanswered own invitations with stored proposed dates and schedule times. Decline locks invitation/observation, rechecks ownership/window/pairing, and commits the response and observee notification together. |
| Observation form | Actual criteria, types, required flags, ranges, answers and acknowledgements. Requires a selected observer and a scheduled observation that has started. Existing assessments retain their template; first save uses the newest active template (creation timestamp, UUID tie-break). Active is the schema's publication surrogate. In-place edits retain the October 18 documented behavior. |
| Next / Submit Form | Observer Next saves a draft. Submit validates required answers and records only the observer's own acknowledgement. Observee reviews read-only answers and acknowledges independently that the observation occurred, not agreement with ratings. Freeze answers after observer submission; both acknowledgements atomically lock/complete the assessment/observation and notify the other participant. |

Form updates lock the parent observation and compare a SHA-256 revision of its identity, template criteria, responses and acknowledgement state. This concurrency token prevents stale overwrites or acknowledgement of unseen changes. Unrecognized stored answer JSON is preserved and reported unavailable. No amendment, withdrawal or AC approval policy is introduced.

Additional private APIs under `/api/me/dashboard`:

- `GET /workflow`: own dropdown/schedule/signup/current-record/request data; no identity/filter inputs.
- `POST /signup`: `{sectionId, dates: YYYY-MM-DD[]}`.
- `POST /requests/decline`: `{candidateId}`.
- `GET /assessment`: current authorized form or null.
- `POST /assessment`: `{action: 'save'|'acknowledge', revision, responses?: {answers: {[criterionId]: number|string}, comments: string}, acknowledged?: true}`. Only observers may send responses. No browser IDs, roles, signature identities or timestamps are trusted.

POSTs require authenticated identity, existing action grants, same-origin JSON and server-validated ownership/state. Success and failure responses are private/no-store; dependency errors are generic.

### Remaining backend support

- The candidate schema does not store an observer-selected proposed date. Accepting a date and final observer confirmation cannot safely persist that choice; acceptance stays unavailable.
- No recommendation-release marker exists. Do not expose internal candidates as released or invent generation/release/invite behavior. AC implementation is outside scope.
- Incomplete-report reason/details and reporting-window rules, survey questions/rating scale and exact eligibility, and committee-alert reason/lifecycle rules still need agreement/storage. Controls explain their unavailable prerequisites; no placeholder successes are returned.
- Automated resend and expired-invitation approval jobs remain separate required project work.

### Follow-up verification

```powershell
$env:TEST_DATABASE_PLANS='true'
node --env-file-if-exists=.env --env-file-if-exists=.env.local --test tests/unit/*.test.mjs
node --env-file-if-exists=.env --env-file-if-exists=.env.local tests/integration/faculty-workflow.mjs
```

The optional SQL-plan test uses `EXPLAIN` in a PostgreSQL read-only transaction, never `EXPLAIN ANALYZE`, validating actual read/lock/insert/update SQL without executing writes. Populated signup, decline, draft and two-party finalization paths use the existing Node transport mocks. Live seeded integration checks dropdown ownership, calendar recurrence, linked routes, auth/no-store and rejected mutations. The seed has no observations, so populated lifecycle mutations are not claimed as live end-to-end tests. Neither check adds fixtures or changes database records; the new integration does not request History.

Final follow-up checks passed: lint, explicit TypeScript check, production build, all 56 Node tests with the SQL-plan option enabled, live seeded workflow integration, and diff whitespace validation. A temporary isolated Chrome check also passed real dropdown selection, calendar date selection/removal, Cancel navigation to `/dashboard`, and desktop/mobile overflow checks. It submitted no business forms and visited no History pages. Captures are temporary ignored artifacts at `.next/faculty-workflow-check/signup-desktop.png` and `signup-mobile.png`. Chrome's GPU subprocess could not run inside the command sandbox; the isolated browser check passed outside it without changing application settings.
