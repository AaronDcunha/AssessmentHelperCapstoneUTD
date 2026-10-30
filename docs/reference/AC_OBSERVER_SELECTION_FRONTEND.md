# AC Observer Selection frontend

October 29, 2026 frontend handoff.

## Implemented scope

Name search filters current-semester signups by observee names only,
ignoring case and surrounding whitespace. Select-all applies
to visible available rows. Existing selections survive filtering; a visible notice
identifies selected rows hidden by the search before generation/release actions.

Observer Selection is current-semester only (user-confirmed October 29): there is
no cycle picker. The page uses the unique configured semester date range containing
today in its semester time zone, ignoring shared selections made on other pages.
Missing/ambiguous configuration displays guidance instead of selecting a past or
future cycle. Recommendation shortfall notifications identify the observee by name;
their observation ID is retained only as internal notification context.

- `/ac/observer-selection` implements the Figma Before Generation and Matching Review states, Candidate Review dialog, and Release Confirmation dialog.
- The shared AC shell supplies the page header/sidebar. The navigation destination and direct page request both require `cycles.read`, `signups.read`, and `observations.read`.
- Generate/release are independently enabled by their effective permissions;
  regeneration stays disabled while its backend route is unavailable. Frontend
  visibility never replaces backend authorization.
- The screen displays API-provided signups, observee/course information, proposed meetings, candidate counts, insufficient/no-match states, selection, and release status.
- Successful generate/release operations refresh signup/candidate/detail data.
- Row selection supports generation before lists exist; the header checkbox selects all available signups. Nothing is selected automatically. Generate applies only to the selected rows, including previously generated no-match lists. Released rows remain disabled.
- Signup status uses the selected cycle's real signup deadline and semester time zone, updating as the deadline passes. Generation is available after signup closes, matching server enforcement. Seeded Admin grants include AC generation/release grants; actual effective permissions are still enforced.
- Selected generation uses `scope.observationIds` (1–500 UUIDs). The server filters by cycle, pending/unpaired/unreleased status and selected IDs; unavailable IDs reject the whole request before writes. Existing department/professor scope filters are also supported. Lists from separate generations are released in separate requests; partial release failures refresh the data.

## API integration

The frontend calls the proposal shapes in `AssessmentHelper_API_Contract_Draft_v2.txt`:

- `GET /api/evaluation-cycles/{cycleId}/signups`
- `POST /api/evaluation-cycles/{cycleId}/recommendations/generate`
- `POST /api/evaluation-cycles/{cycleId}/recommendations/release`
- `POST /api/observations/{observationId}/recommendations/regenerate`
- `GET /api/observations/{observationId}/candidates`
- existing `GET /api/observations/{observationId}` for the revision required by regeneration

The signup and candidate reads are backed by authorized Prisma queries. Main now
provides recommendation generation and release services, and the frontend refreshes
after those operations. Per-observation regeneration remains pending backend work;
the capability is disabled rather than invoking a missing route or fabricating data.

The release contract requires generationId. Each row uses its selected list's
generationId, with legacy response fallback only when list metadata is absent.
No identifier from a different row/batch is substituted. Current draft/released
pointers govern action availability. Signups without observations stay visible
but cannot trigger observation API calls or actions. Candidate pages are collected
under one pinned listId; foreign/changed list responses are rejected.

Course history is the canonical array of up to five recent distinct course/semester
pairs, including older semesters. Missing history displays an em dash. Persisted
meeting UUIDs and nullable metadata are retained; missing times display unavailable
rather than epoch/midnight values. Recorded candidate status and latest actual
response status remain distinct. The regeneration endpoint is not implemented and
no visible control invokes it in this integration.

The temporary browser-only records used to review the two dialogs were removed. The
screen now renders only API/database data. The dialogs use a document-body portal and
root scroll lock so opening a modal does not reposition the shared sidebar account.

## Verification

Review corrections: empty candidate reads without generation/release metadata remain
Not generated; generated empty lists remain No matches. Cycle changes remount the
workflow to clear selections, dialogs and generation state, and invalidate pending
reads. Release is disabled during refresh and when a row has no real generation
identity. Generate uses the primary button,
actions sit beside the heading, and candidate rows override the shared cell wrapper's
minimum height to match the compact Figma rows.

- `tests/unit/ac-api.test.mjs` checks exact endpoint paths, methods, and mutation bodies.
- `tests/unit/ac-access.test.mjs` checks direct route and navigation permissions.
- `tests/unit/observer-selection.test.mjs` checks course/meeting formatting, availability mapping, and generated/insufficient/no-match presentation states.
