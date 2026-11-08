# Late Acceptance Requests

Implemented November 5, 2026, from the November 1 board task and supplied Figma
screenshots. Review locally at http://localhost:3000/ac/late-acceptance-requests.
Direct review uses `/ac/late-acceptance-requests/{approvalId}`. Only effective
`late-acceptance.review` is required for navigation and direct page/API access.

The shared shell supplies navigation and header; the screen uses semantic palette,
typography, spacing, buttons, form fields and table cells. Search/status survive
review/back navigation through URL parameters. Back to requests performs no write.
Each list visit fetches fresh rows/counts. Request changes hide old data immediately;
the existing resource hook ignores late responses. Conflicts reload the exact saved
request; uncertain reloads hide decisions until resolved. Both decision buttons are
disabled during submission. Unauthorized reads show no review controls.

The current cycle is the unique semester whose configured inclusive dates contain
today in its own time zone, using the same helper as Observer Selection. It never
uses another page's selected cycle. Missing dates, no match or overlaps show a
configuration state. The current local database has no matching configured cycle;
this is a real configuration state, not a substituted empty result.

`GET /api/evaluation-cycles/current/expired-acceptance-requests` resolves that cycle
on every request. UUID cycle IDs remain supported for existing explicit-cycle API
consumers. `requestId` provides an exact scoped lookup independently of list filters
or pages. The API contract draft documents the complete fields and errors.

Search matches only requester name; status is independent. Stable ordering is
requestedAt descending then approvalId descending. Cursor pagination defaults to
20 and allows 1–100. The summary always covers the whole cycle: actionable pending,
persisted approved, blocked pending, and total including rejected. The list states
that filters do not affect counts. Pending/filter actionability is computed before
pagination from linked current workflow state. The implementation reads the full
cycle's approval context in a RepeatableRead transaction to derive these states
consistently; large-cycle query/memory optimization remains a scaling consideration.

The saved reason is rendered as text. Derived `actionReason` is separate. The
original invitation expiry belongs to the request's associated attempt. Meetings
use recorded snapshots where available, otherwise the linked class schedule.
Persisted decisions remain Approved/Rejected after later workflow changes; pending
requests show the actual restriction (superseded, confirmed observer, deadline,
closed observation, answered or unexpired invitation).

`PATCH /api/expired-acceptance-requests/{approvalId}` accepts only
`{decision:"approved"|"rejected"}`. Existing same-origin JSON/size checks remain.
Serializable writes share a service actionability guard with reads, touch the
observation revision, and conditionally update a still-pending approval. Approval
creates an ordinary invitation attempt ending at min(now + 48h, observation
deadline). It never accepts a proposed meeting or selects an observer. Rejection
only records the decision. Downstream acceptance and observee selection retain
their existing validation. Conflicts return 409 and require an authoritative read.

Dashboard Needs attention currently advertises expiredApproval as unavailable and
has no request identifier to link unambiguously. No unrelated dashboard behavior,
notification/email implementation or matching generation was changed.

## Verification

- `node --test tests/unit/*.test.mjs`: 312 passed. New focused tests cover combined
  observer-only search/status across 145 rows and cursor pages, exact lookup beyond
  the first page, current semester/time-zone boundaries, missing/overlapping cycles,
  permissions, validation, saved reason/decision and distinct restriction reasons.
- Existing access tests now include list/detail routes and navigation. Existing
  approval fixtures supply current-cycle context. The local verification run also
  used a pre-existing cycle-selection test mock correction for useEffect and
  paginated limit=21. That unrelated correction is excluded from the feature commit
  and preserved in the local working tree.
- `node --env-file-if-exists=.env --env-file-if-exists=.env.local
  tests/integration/late-acceptance.mjs`: disposable randomly named local schema,
  applies checked-in migrations there and drops only that schema afterward. Real
  PostgreSQL tests cover approval/rejection, original expiry retention, concurrent
  decisions, latest-attempt/cancellation/answered guards, confirmed observer,
  deadlines, current-cycle guard, one-hour deadline cap, approved observer accepting
  a valid meeting and observee confirming. Existing notifications are queued only
  inside the disposable schema; no SMTP worker runs.
- `node tests/integration/late-acceptance-http.mjs`: live production app and existing
  seeded accounts; anonymous API 401/page redirect, Faculty 403/forbidden redirect,
  AC/Admin current and explicit-cycle 200, private/no-store and invalid input checks.
  No successful live business mutation or sample request is created.
- `node tests/e2e/late-acceptance.mjs`: actual production application in isolated
  headless Chrome, all business APIs intercepted in that browser target. Checks
  list, skeleton, pending/approved/rejected/stale views, safe saved text, conflict
  reload, disabled decision controls, empty/no-results/error/retry retaining
  filters, Back to requests without a write, keyboard focus on saved outcomes,
  stale filter-response exclusion, missing current cycle and 390px overflow. Screenshots are in OS temp as
  `late-acceptance-{list,pending,approved,rejected,stale,mobile}.png`.
- `npm run lint`, `npx tsc --noEmit`, and production `npm run build` pass. Restricted
  build initially could not fetch Inter; build with network access passed.

Live verification first found two existing pending migrations on verified local
`127.0.0.1:5432/assessment_helper`, schema public. Explicit-cycle GET returned 503.
After reviewing and deploying `20261028040000_recommendation_lists` and
`20261030000000_recommendation_publication`, the read returned 200 and all eleven
migrations are applied. These add recommendation/publication metadata and retain
existing attempts, responses, approvals and assignments. No migration definitions,
credentials or environment files were edited; no reset, reseed or volume deletion.

The review server uses process-only `AUTH_TRUST_HOST=true` for localhost Auth.js;
normal environment files are unchanged. Browser tests require existing ignored
seeded credentials and Chrome/Edge remote debugging on port 9223 (override with
TEST_CDP_URL); TEST_BASE_URL can select another localhost server. Populated business
states are fixture-verified, not live records. Figma's web link was inaccessible;
visual checks used the screenshots supplied with the task.

## File inventory and Git handoff

Branch: `Sai/ac-late-acceptance-requests`, created from fetched `origin/main` at
`3c1add3ca2026a4666a9edbf10cb5fc307eb5e01`. Initial working tree was clean.
The feature commit excludes unrelated local changes; no push, PR or merge was
performed. The unrelated cycle-selection test correction remains unstaged locally.

New files:

- `src/app/(main)/ac/late-acceptance-requests/page.tsx`
- `src/app/(main)/ac/late-acceptance-requests/[requestId]/page.tsx`
- `src/components/ac/late-acceptance-screen.tsx`
- `src/lib/late-acceptance.ts`
- `src/server/queries/late-acceptance.ts`
- `src/server/services/late-acceptance-state.ts`
- `tests/unit/late-acceptance.test.mjs`
- `tests/integration/late-acceptance.mjs`
- `tests/integration/late-acceptance-http.mjs`
- `tests/e2e/late-acceptance.mjs`
- `docs/reference/LATE_ACCEPTANCE_REQUESTS.md`

Modified files:

- `src/app/(main)/layout.tsx`
- `src/app/api/evaluation-cycles/[cycleId]/expired-acceptance-requests/route.ts`
- `src/components/layout/navigation-config.ts`
- `src/lib/ac-permissions.ts`
- `src/server/services/faculty-invitations.ts`
- `tests/unit/ac-access.test.mjs`
- `tests/unit/admin-dashboard.test.mjs`
- `tests/unit/faculty-invitations.test.mjs`
- `docs/reference/AssessmentHelper_API_Contract_Draft_v2.txt`
- `docs/reference/Implementation_Notes.txt`
- `docs/reference/README.md`

Generated Prisma output, build output, local verification logs and browser screenshots
are ignored or outside the feature diff. Environment files and credentials are unchanged.
