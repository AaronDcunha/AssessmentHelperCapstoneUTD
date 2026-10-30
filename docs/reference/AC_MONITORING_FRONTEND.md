# AC monitoring frontend integration

October 29, 2026 issue #74: Dashboard Needs attention now combines the existing
attention and paginated cycle-alert APIs with independent failure/retry states,
stable message-ID deduplication and exact saved-message Review links. Current
attention queries provide non-message issues; alert data comes from the separate
existing message endpoint. Reviews reuse read-only observation details and preserve
all page/API guards. See [issue #74 handoff](AC_DASHBOARD_ALERTS.md) for the completed
checklist, files, permission mapping, controlled verification and local URLs.

October 23, 2026: fixes the list-envelope, real-cycle selection, and business-permission review findings on `feature/ac-monitoring-reports-final`.

## Lists and cycle selection

`src/lib/ac-api.ts` consumes contract lists as `{items,pageInfo:{nextCursor,hasMore}}`. Its list reader follows cursors while preserving filters, then supplies arrays to the existing tables. This covers evaluation cycles, faculty status, attention, observations, and hiring-level lookups. Empty lists remain arrays. Invalid envelopes or missing/repeated continuation cursors fail with an API error instead of crashing `.map()` or looping indefinitely. Counts and KPI responses remain ordinary objects.

`AcCycleProvider` loads authorized cycles once for the AC layout and keeps the selected cycle while navigating between its pages. A sole cycle is selected automatically. Multiple cycles require an explicit choice; list ordering and deadlines do not establish a current-cycle policy. With no cycles, an API error, or no valid selection, cycle-specific requests are not sent. An inaccessible/removed selection is not used for requests. There is no `/evaluation-cycles/current` alias or fabricated Fall 2026 option.

The dashboard, faculty list, reports, and semester settings show the shared selector. Observation Progress additionally supports All semesters, fetching each actual returned cycle ID and combining its paginated observations. Selecting All semesters does not force that selection onto pages requiring one cycle; those pages ask for an individual choice. The template lookup is global and sends no invented cycle ID.

When a loader changes (cycle or filter), the resource hook immediately stops exposing the previous loader's data, and ignores late responses from a superseded request. Existing KPI/zero fallback presentation remains as-is per the user's deferral.

## Page and navigation authorization

`src/lib/ac-permissions.ts` defines the shared requirements below; **all** listed grants are required for a page. Navigation uses the same predicate as server page guards in `src/server/ac-access.ts`.

| Page | Required grants |
| --- | --- |
| Dashboard | `cycles.read`, `reports.read`, `observations.read` |
| Faculty Due / Overdue | `cycles.read`, `reports.read` |
| Observation Progress | `cycles.read`, `observations.read` |
| Observation Details | `observations.read`; assessment panel additionally requires `assessments.read` |
| Reports / KPIs | `cycles.read`, `reports.read`, `metrics.read` |
| Evaluation Cycles | `cycles.read` |
| Create / Edit Cycle | `cycles.manage` |
| Semester Settings | `cycles.read`, `cycles.manage` |
| Template Editor | `templates.manage` |

Each page, including nested detail and edit routes, establishes identity and checks its grants on the server before returning its client screen. The shared layout authenticates and provides cycle context without imposing one role/fixture permission on every child. Reserved mock AC/Admin accounts with only `test:*` grants do not gain product-page access. Seeded AC/Admin database accounts have the necessary business grants. Role names alone never grant access. Users with cycle read access alone do not see Create/Edit controls. Temporary Admin component-test navigation remains unchanged.

These frontend guards do not replace API authorization. Backend handlers must independently check permissions, scope, ownership, and visibility. No monitoring API handlers, database queries, schema changes, or migrations are added by this frontend fix. Merge/supply the backend routes separately before expecting live monitoring data. The generic unavailable UI remains while endpoints are absent.

## Observation progress and meetings

The detail page now renders the existing `GET /api/observations/{observationId}` response's `progress`, `observation.scheduledMeeting`, and `proposedMeetings` fields. No endpoint or response-contract change is needed. Progress steps retain backend order/labels/states and show their returned completion timestamps in UTC; no workflow stage is inferred or invented. Meeting dates, start/end timestamps, locations, and optional availability/reasons are displayed read-only. Times use the meeting's supplied IANA time zone; missing/invalid zones get an explicit UTC fallback notice. Scheduled appointments and proposed options are separate sections. Missing fields show empty/unavailable states. These sections load only after observation details are successfully retrieved; the existing observation read guard and backend record visibility requirements still apply.

## Read-only assessment view

The follow-up request implements the assessment panel on `/ac/observations/{observationId}`. The server page passes whether the user has `assessments.read`; users with observation access alone retain basic detail access but do not load assessment content. After observation detail loads, the panel uses these existing draft-contract reads:

- `GET /api/observations/{observationId}/assessment` returns `{observationId,templateVersionId?,assessment,allowedActions}`.
- `GET /api/observations/{observationId}/template` returns the exact assigned template. This is requested only when an assessment is available; the global current template is never used as a substitute.

`assessment` contains ID, observationId, status, revision, `answers:[{criterionId,value}]`, `comments:[{promptId,text}]`, submittedAt, `acknowledgements:[{actorId,participantRole,acknowledgedAt}]`, and allowedActions. The template supplies title, criteria with IDs/prompts/types/orders/options, comment prompts with IDs, and signature labels. Existing `templateVersionId` fields are checked against the returned assigned template when provided; no new version model is introduced. The backend must keep these IDs coherent and enforce record/draft visibility independently.

Questions follow template order and answers join by criterion ID, not array position. Ratings use the assigned options through the shared read-only rating component; text answers/comments retain line breaks and are escaped by React. Null/missing answers display Not answered, while numeric zero remains a real answer. Status, submission time, and returned acknowledgements are displayed without inferring finalization/signature rules. No save/submit/acknowledge/upload action is rendered, even if allowedActions includes edit grants. Failed/denied reads and null assessments have explicit unavailable/empty states. Tests use contract fixtures because these backend endpoints are not implemented in this frontend branch.

## Faculty last-evaluation response change

Confirmed October 23, 2026 for **`GET /api/evaluation-cycles/{cycleId}/faculty-status`**. The URL, filters, list envelope, and other fields stay unchanged. Inside each faculty row, replace `lastEvaluation.semesterId` with `lastEvaluation.semester: {id,name}`:

```json
{
  "lastEvaluation": {
    "semester": { "id": "<semester UUID>", "name": "Fall 2026" },
    "completedAt": "2026-10-23T12:00:00Z"
  }
}
```

Return `lastEvaluation: null` when the faculty member has no last evaluation. The backend should resolve the semester of that last completed evaluation and return its existing `termName` as `name`. It must not reuse the currently selected reporting cycle's semester for older evaluations. No database schema change is required. This backend endpoint remains to be implemented; this change updates its contract and the frontend consumer.

The Faculty Due / Overdue table now displays `lastEvaluation.semester.name` (for example, Fall 2026). Missing history or a missing/blank display name shows a dash; the UI never falls back to displaying the UUID. The authoritative API draft section 8 and implementation notes record the same contract change for the backend developer. This is separate from Faculty History's `Section.semester` work.

## Deferred work

Per the user, unavailable KPI values continue to display zero for now. Template editor payloads, semester settings, and configuration form/date behavior are outside this follow-up.

## Verification

```text
node --test tests/unit/*.test.mjs
npx tsc --noEmit
npm run lint
```

The tests cover paginated contract responses, preserved filters, malformed pagination, zero/one/multiple cycles, explicit selection changes, all-semester observation requests, every server page guard (including partial permission revocation and fixture-only accounts), and navigation/guard consistency. Existing Faculty navigation tests remain intact.

For read-only live HTTP access checks, start the development server with local PostgreSQL and existing seeded accounts, then run:

```text
node tests/integration/ac-monitoring.mjs
```

Default server: `http://localhost:3000`; override `TEST_BASE_URL` if needed. It checks all ten AC page routes using anonymous, Faculty, AC, and Admin sessions, and checks sidebar visibility. No application records are modified. This HTTP check verifies page access, not missing backend endpoints. Assessment unit tests cover assigned-template reads, unavailable/denied/mismatched responses, answer mapping, custom scales, zero/missing answers, safe text rendering, and separate assessment permissions.
