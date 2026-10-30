# AC Configuration Frontend — issue #52

Weekly progress implementation, October 26, 2026. Branch
`Sai/ac-configuration-frontend` starts at fetched `origin/main` (`7e02f9b`).
Faculty branch/PR #72 are unchanged; no Faculty commits were merged or cherry-picked.

October 29, 2026 Task #6 follow-up: cycle creation now waits for the shared
paginated existing-cycle lookup before enabling semester selection/submission.
Lookup failures expose Retry cycles without clearing deadlines. Occupied semesters
stay labeled/disabled, including when all semesters have cycles. A creation 409
refreshes availability while retaining the selected semester and all deadlines;
the edit-only discard/reload action is no longer shown for creation conflicts.
The existing paginated semester API helper, UUID option values, deadline conversion,
shared controls, permission guards and backend validation remain in use.

Focused regression checks (Node 24.22.1, locked dependencies): nine configuration
unit tests passed, including multi-page semesters, later-page failure, restart on
retry and repeated-cursor rejection. `tests/e2e/cycle-semester-dropdown.mjs` passed
against the production build with all business mutations intercepted. It covers
semester/cycle loading, both paginated lists, name/UUID options, required and
occupied selection, exact POST payload, duplicate submissions, retained fields
after 422/network/409 failures, lookup retries, empty/all-occupied states and
successful creation navigation. TypeScript, lint and production build passed.
Only existing seeded authentication/page guards accessed application data; no
configuration records, environment files, schema or backend were changed.

```text
node --test tests/unit/ac-configuration-frontend.test.mjs
node tests/e2e/cycle-semester-dropdown.mjs
```

The browser test uses the same localhost/CDP prerequisites documented below.

## Screens and API mappings

| Route | Behavior and existing APIs |
| --- | --- |
| `/ac/cycles` | Paginated cycle list; loading/empty/error/retry states, permitted row edit menu. `GET /api/evaluation-cycles`. |
| `/ac/cycles/new` | Real semester names/choices, existing-cycle choices disabled, chronological deadline validation, duplicate-submit protection, Cancel to list. `GET /api/semesters`, `POST /api/evaluation-cycles`. |
| `/ac/cycles/{id}/edit` | Read-only semester; deadline PATCH with `expectedRevision`, without `semesterId`. `GET/PATCH /api/evaluation-cycles/{id}`. Successful saves refresh list/context. |
| `/ac/semester` | Shared explicit cycle selector, nested semester dates/time zone, missing-boundary warning. Atomic `PUT /api/evaluation-cycles/{id}/settings` with both revisions; response updates baseline/revisions. Cancel restores last confirmed values. |
| `/ac/template` | Global list includes drafts and published templates. `GET /api/observation-templates`, `GET /api/observation-templates/{id}`, `POST/PATCH /api/observation-templates[/{id}]`, `POST /api/observation-templates/{id}/publish`. |

Template sections cover scale questions, long responses, comments and signature
labels. Add/remove/edit/reorder, required flags, weights and per-question rating
values/labels work. Existing IDs/keys persist; UI-only IDs never enter requests;
new questions/prompts omit server IDs. Successful saves retain returned IDs/revisions.
Published templates remain editable in place, with a warning about linked forms.
Draft publication requires saved changes and confirmation. Referenced-question
removal/conflicts show the server rejection; no automatic overwrite or replacement.

Preview uses current unsaved state, ordered questions, custom rating options,
required indicators, comments and signature labels through shared form/rating/Section
components. Return keeps the editor and its current section. Demonstration responses
never save a configuration or submit an assessment. No duplicate preview route.

October 27 navigation follow-up: dirty template edits register a shared capture-phase
link guard, so sidebar and other same-tab internal links ask before discarding edits.
Cancel stops the click before the client router; confirming leaves normally. Saved
or unmounted editors remove the guard. Refresh/close retain native unload protection.
Cancelable Navigation API Back/Forward traversals also ask; browsers that do not
expose cancelable traversal events cannot provide this same-document history guard.
No history entries or Next.js router methods are patched. Focused event tests cover
Stay/Discard, cleanup, modified/new-tab/download/hash clicks, unload and traversals.

October 27 creation retry follow-up: new-template POSTs include a UUID creationKey.
An uncertain response retains the attempted payload/key in the mounted editor and
locks fields/Cancel; Retry Save resends that original request to recover its draft.
Success adopts the returned ID/revision and subsequent saves use PATCH. Confirmed
initial client rejections permit correction. Protection applies to retries in this
editor session; deliberately discarding the editor and starting a new template is
a new creation. Backend/database integration and focused unit checks passed; live
browser verification of the new retry state has not been run.

October 27 broader verification: the full 171-test unit suite passes with optional
database query planning enabled (no skipped tests), and the production build passes
outside the sandbox. Two old navigation assertions were aligned with commit 70941d6's
intentional removal of demo shortcuts. Product navigation/permissions were unchanged.

## Reference mapping and frontend choices

12 supplied image files contain 13 screen/state references: 1 dashboard, 2 cycle
list/edit-menu, 3 Faculty Due, 4 observation progress, 5 template scale section,
6 reports, 7 semester settings, 8 left long responses/right comments-signatures,
9 observer matching review, 10 before generation, 11 release confirmation,
12 candidate review dialog. Images 2/5/7/8 guide this implementation; the rest
provide existing-shell/style context only. No monitoring, matching, reports, History,
Faculty, Admin or authentication implementation is changed. Blue Figma selection
outlines and screenshot annotations are not application UI.

Deadline inputs include time (unlike the date-only screenshot) to avoid silently
truncating configured instants. Values display/convert in the semester's IANA zone;
writes are UTC ISO timestamps ending in Z. Unedited deadlines preserve the exact
original instant, including milliseconds. Edited DST gaps/repeated times require
an unambiguous choice. There is no invented end-of-day cutoff. Semester boundaries
stay date-only; feedback can follow semester end. Settings preserve the stored time
zone rather than offering an unsupported semester rename.

Only a sole cycle is automatically selected; multiple cycles require an explicit
choice. Template selection includes drafts rather than relying on `/current`.
New templates start empty, with editable descriptive five-point defaults only when
adding a new rating question. Existing custom scales are preserved. Reordering within
a section swaps that type's questions while retaining other question positions.

Server page guards remain intact. `allowedActions` governs per-cycle controls;
API authorization is authoritative. Reads use same-origin URLs/no-store and existing
session cookies. Errors distinguish 401/403/404/409/422, network and server failure;
edits survive failed saves. Reload-after-conflict explicitly discards edits only on
confirmation. Old responses cannot replace a newer cycle/template selection.

## Verification and limits

Passed: lint, explicit TypeScript, production build, all 132 existing/new unit tests
(including 26 AC-focused tests), and controlled Edge browser checks against the
production build at `http://localhost:3001`. Browser tests cover list/create/edit,
settings revisions/cancel/conflicts, all template sections, IDs/order/custom scales,
create/update/publish, preview/return, failures/retry and desktop/mobile layouts.
Captured desktop/mobile configuration screens were visually inspected. This is a
close token-based implementation, not a pixel-diff certification.

```text
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
node --test tests/unit/*.test.mjs
npm.cmd run build
# Running local app + isolated Edge/Chrome with CDP on 9225:
$env:TEST_BASE_URL = 'http://localhost:3001'
node tests/e2e/ac-configuration.mjs
```

All browser configuration writes are intercepted fixtures. Existing seeded AC
authentication/page guards use the application database. Additional read-only HTTP
checks returned 200 for live cycles, semesters and template lists. Real configuration mutation
integration was deliberately not run; no semester dates/templates were changed,
and no migration, seed, reset, volume or email work occurred. Backend persistence
remains supplied by the existing configuration contract, not implemented here.
No core issue #52 requirement is knowingly deferred. Testing every IANA zone and a
full assistive-technology audit remain later integration checks. The initial dev
browser run encountered a hot-reload loop; production-build checks passed instead.
Local production startup used process-only `AUTH_TRUST_HOST=true` for localhost,
without changing authentication code or environment files.
# Semester dropdown ordering

Cycle creation lists semesters newest first, with Fall, Summer, then Spring within
each year. Ordering is applied after all semester API pages are loaded; existing-cycle
labels and disabled options retain their chronological position.
