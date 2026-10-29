# AC Observer Selection frontend

October 29, 2026 frontend handoff.

## Implemented scope

- `/ac/observer-selection` implements the Figma Before Generation and Matching Review states, Candidate Review dialog, and Release Confirmation dialog.
- The shared AC shell supplies the page header/sidebar. The navigation destination and direct page request both require `cycles.read`, `signups.read`, and `observations.read`.
- Actions are independently enabled by `recommendations.generate`, `recommendations.release`, and `recommendations.regenerate`; frontend visibility never replaces backend authorization.
- The screen displays API-provided signups, observee/course information, proposed meetings, candidate counts, insufficient/no-match states, selection, and release status.
- Successful generate, per-observation regenerate, and release operations refresh signup/candidate/detail data.

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
its failure is shown without substituting synthetic frontend data.

The release contract requires `generationId`, but no separate read-current-generation endpoint is defined. The frontend retains the ID returned by generation/regeneration and also accepts an optional `generationId` from the candidate response if Task 2 includes it. If a previously generated list is loaded without that ID, release remains unavailable and the UI asks the AC user to regenerate first rather than inventing an identifier.

Candidate course history is displayed when the candidate response supplies `courseHistory`; the draft `Candidate` shape does not currently guarantee this Figma field, so the UI displays an em dash when absent.

The temporary browser-only records used to review the two dialogs were removed. The
screen now renders only API/database data. The dialogs use a document-body portal and
root scroll lock so opening a modal does not reposition the shared sidebar account.

## Verification

- `tests/unit/ac-api.test.mjs` checks exact endpoint paths, methods, and mutation bodies.
- `tests/unit/ac-access.test.mjs` checks direct route and navigation permissions.
- `tests/unit/observer-selection.test.mjs` checks course/meeting formatting, availability mapping, and generated/insufficient/no-match presentation states.
