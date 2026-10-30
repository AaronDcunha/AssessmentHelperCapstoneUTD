# Issue #74: AC Dashboard Alerts

Implemented October 29, 2026 on `Sai/ac-dashboard-alerts`, starting at fetched
`origin/main` (`8d0a9b7`). Task #6's separate commit is not an ancestor of this
branch. Task #5 / issue #74 is kept separate from that submission.

## Requirements checklist

- [x] Selected-cycle, paginated alerts appear inside the existing Needs attention table.
- [x] Cycle changes immediately hide old data; superseded responses cannot replace the current cycle.
- [x] No cycle-specific reads run without a valid selected cycle.
- [x] Rows display Faculty, Alert, actual observation status and an exact-message Review link.
- [x] Stable alert IDs deduplicate overlapping sources; separate messages on one observation remain separate.
- [x] Overdue/unmatched/incomplete rows and dashboard summary behavior are retained.
- [x] Loading, no-selection, successful empty, partial/full failure and per-source retries are available.
- [x] Existing details show saved reason/full text, creator, observation, course, semester and candidate context.
- [x] Alert/observation pairing, safe text/line breaks, long messages, denied/missing/error states and retries are handled.
- [x] Dashboard back navigation, shared components and server guards are preserved.
- [x] Review is read-only. This satisfies the conditional lifecycle requirement: the current contract deliberately has no acknowledgement/resolution workflow, and PATCH returns 405. No lifecycle controls, statuses or writes were added.

No unmet issue #74 requirements are known.

## Endpoint and permission mapping

| Read | Integration and access |
| --- | --- |
| `GET /api/evaluation-cycles/{cycleId}/attention` | Existing non-message issues; current query explicitly lists alerts as unavailable. Dashboard page still requires `cycles.read`, `reports.read`, `observations.read`; attention API requires `reports.read`. |
| `GET /api/evaluation-cycles/{cycleId}/alerts` | Existing `acApi.getCycleAlerts` follows all cursor pages. API requires `observations.read`; university-wide AC scope is unchanged. |
| `GET /api/alerts/{alertId}` | Existing `AlertContext` requests the exact saved message. AC detail page/API use `observations.read`. The API's existing own-observee access remains unchanged. |
| `GET /api/observations/{observationId}` | Existing detail page/context and authorization; observation failure now has Retry observation. Assessment reads still require the separate `assessments.read` grant. |

The frontend join also supports the attention draft's optional `alertId`. For an
attention alert without that field, its stable `id` is used. Other issue keys use
issue plus ID. Names and observation IDs never deduplicate messages. The alerts
resource supplies the canonical observation status when both sources contain the
same alert. Independent resource hooks preserve a successful source when the
other fails; failures are never presented as successful empty lists.

## Changed files

- `src/app/(main)/ac/dashboard-screen.tsx`: two-source table, independent retry/error/loading states.
- `src/lib/ac-attention.ts`: stable-key merge and exact Review URLs.
- `src/lib/ac-api.ts`: backward-compatible optional attention `alertId` typing.
- `src/components/ac/attention-table-row.tsx` and `src/components/shared/status-badge.tsx`: additive Alert label.
- `src/components/ac/alert-context.tsx`: safe failure messages, retry, full text wrapping and additional returned context.
- `src/app/(main)/ac/observations/[observationId]/page.tsx`: alert review returns to AC Dashboard.
- `src/components/observations/observation-details.tsx`: retry the existing observation read after failure.
- `tests/unit/ac-dashboard-alerts.test.mjs`, `tests/unit/ac-cycle-selection.test.mjs`, `tests/e2e/ac-dashboard-alerts.mjs`: focused regressions and existing selection-test adaptation.
- This handoff, `AC_MONITORING_FRONTEND.md`, `ALERTS_REMINDERS_BACKEND.md`, `Implementation_Notes.txt` and the reference README: current integration guidance.

## Verification

Node 24.22.1 with the existing locked dependency tree:

- 27 focused unit checks passed: alert merge/identity/URLs/GET pagination, cycle selection/stale-response hook, AC page permissions, assessment reads and shared layout compatibility.
- `npm run lint`, `npx tsc --noEmit --incremental false` and `npm run build` passed.
- `node tests/e2e/ac-dashboard-alerts.mjs` passed against the production build. It covers selected-cycle reads/pagination, stale responses, duplicate and distinct messages, non-alert issues, loading/empty/partial/full failures, list/detail 401/403/404/network/server errors and retries, exact-message pairing, saved text/context, no lifecycle controls/writes and desktop/mobile overflow. Screenshots were visually inspected.

Browser prerequisites: running local production app, existing seeded AC account
in ignored `prisma/demo-accounts.txt`, isolated Edge/Chrome CDP on port 9223.
Override `TEST_BASE_URL`/`TEST_CDP_URL` if needed. Every business mutation is blocked
in the test; populated and failure states are intercepted fixtures. Only seeded
authentication and server page guards read application data. That initial fixture
verification changed no real alerts, emails, database records, environment files,
backend services, schema or migrations. Tests do not populate the review
application's data. The subsequent local migration repair is recorded below.

## Live database follow-up

The first live request to
`GET /api/evaluation-cycles/91a3b32d-15cd-55a5-a6b3-9cc67d0c9901/alerts`
returned 503 `{error:{code:"UNAVAILABLE",message:"The workflow service is temporarily unavailable."}}`.
The running production server logged no exception: the existing workflow wrapper
catches database exceptions and returns that sanitized response without logging.
A read-only reproduction of its exact query exposed Prisma `P2022`, PostgreSQL
`42703`: `column faculty_issue.occurrence_key does not exist`. This was not a
frontend request/pagination issue or a permission rejection.

Only the first four migrations were applied locally. `prisma migrate status`
reported five checked-in pending migrations: template creation idempotency,
notifications, alerts/reminders, notification email and multiple observation alerts.
The current generated Prisma Client expects columns introduced by these migrations;
the missing occurrence_key is introduced by the final multiple-alerts migration.

Reviewed all five existing SQL files and local preconditions, then ran the documented
`npx prisma migrate deploy` environment setup. No migration file or backend/frontend
code was changed for this repair. Deployment applied the five existing migrations
without resets, reseeding, credential/environment changes or volume deletion.
Existing business-table counts remained unchanged (539 users/credentials, one cycle,
zero alerts/observations/signups/notifications); the new email/reminder tables are
empty. As defined in the existing migration, metadata now includes the inert legacy
`alerts.manage` permission and its two AC/Admin links; current endpoint authorization
still uses `observations.read`, with no lifecycle actions enabled.

Verified afterward against the same running production server using existing
accounts and real GET requests, with no interception: the exact alerts URL returns
200, `Cache-Control: private, no-store`, and
`{items:[],pageInfo:{hasMore:false,nextCursor:null}}`. The empty list reflects the
actual zero stored alerts. Anonymous GET remains 401, Faculty GET remains 403,
and AC/Admin GETs return 200. `prisma migrate status` reports all nine applied and
the schema up to date. No alerts, reminders or emails were sent. No further app
code changes or build were needed for this environment-only correction.

## Local review

- Dashboard: `http://localhost:3000/ac`
- Observation progress/existing message links: `http://localhost:3000/ac/observations`
- Controlled exact-message detail fixture: `http://localhost:3000/ac/observations/74000000-0000-4000-8000-000000000010?alertId=74000000-0000-4000-8000-000000000020` (available only inside the intercepted browser run).
- Real details use `/ac/observations/{observationId}?alertId={alertId}` from the dashboard Review action, with existing authorized data.
