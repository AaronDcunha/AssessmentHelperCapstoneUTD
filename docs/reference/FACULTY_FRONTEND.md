# Faculty frontend handoff

The Faculty screens use one account and one application shell. Observer/Observee participation belongs to an observation, not a second account or dashboard. The October 19 backend integration replaces sample values with authorized PostgreSQL reads and real empty states. The follow-up also wires the linked evaluation, signup/calendar, current-record, appointment, incoming-request and assessment screens. See [Faculty dashboard backend](FACULTY_DASHBOARD_BACKEND.md) for supported actions and remaining blockers and [Auth backend](AUTH_BACKEND.md) for session/permission integration. The current user scope explicitly excludes changes to History or its navigation.

The original frontend work was on Sai/faculty-dashboard. The later Sai/faculty-dashboard-backend work connects dashboard data and its linked workflows; it does not change History, schema, authentication, AC, or Admin behavior. Verification and integration limitations below describe the earlier frontend handoff unless superseded by the dashboard/backend documentation above.

## Canonical routes and purpose

The later History-navigation fix adds the single canonical read-only route `/observations/history`. Other routes retain their existing paths and behavior.

| Route | Purpose and current behavior |
| --- | --- |
| /dashboard | Authorized evaluation status/last completion, current observation, pending request count, and recent notifications from PostgreSQL, with empty/unavailable states and the three existing Figma shortcuts. |
| /dashboard/evaluation | Real status, hiring level, last completed evaluation and cycle/deadlines, with the existing signup link. Missing data is unavailable/unknown. |
| /observations | Authorized current-cycle work as Observer or Observee, linking current details and a scheduled appointment; real empty state otherwise. |
| /observations/history | Read-only completed/past observations across semesters. Semester, Observer/Observee, and status filters; semester, role, course/section, other professor, and status/form columns. Currently empty because no authorized history data source exists. No APIs or persistence added. |
| /observations/signup | Own course-section dropdown, stored weekly schedule/calendar options, date selection, review and transactional submit/cancel. Server revalidates ownership, deadline, dates and eligibility. Missing-history eligibility remains blocked, including the current seed. Successful signup does not imply released recommendations. |
| /observations/recommendations | Released candidates the Observee may invite. Empty candidate table; Send Requests is unavailable without candidates and selection. It does not imply acceptance/assignment or jump to accepted candidates. Back returns to the observation. Alert feedback explicitly says no notification was sent. |
| /observations/confirmed | Only accepted candidates for choosing one final Observer. Separate screen composition and accepted-only empty state; explains confirmation/cancellation. Back returns to the observation, not signup or recommendations. |
| /observations/requests | Actual active incoming invitations, proposed dates and expiry. Decline persists with server checks; acceptance is unavailable because the schema cannot retain the chosen meeting. No resend/approval behavior is invented. |
| /observations/details | Real own current record status, participation, participants, course, scheduled/proposed dates and form link. Reporting/survey actions retain explicit prerequisites and unresolved-support explanations. |
| /observations/appointment | Actual participants, course, scheduled date/time and unambiguous schedule location. View Observation returns to Details; form opens when scheduled/assigned. Incomplete reporting remains unavailable. |
| /observations/form | Three existing steps use actual template criteria/ranges and saved answers. Observer Next saves a draft; Submit acknowledges for that authenticated observer. Observee reviews and acknowledges independently; both finalize/lock. Server checks permissions, scheduled participation, required answers and stale revisions. No form is fabricated when the seed has no observations. |

The recommended/accepted tables share presentation only. Details and Appointment share field rendering only. Their screen purposes, fields, actions, and back links are independent.

## History, notifications, identity and scope

The sidebar contains Dashboard, My Evaluation, Observer Requests, Observations, and **History**. History now links to `/observations/history` and uses the existing active-link matching. The user explicitly authorized this simple read-only frontend after the earlier exclusion; no other page behavior or navigation authorization changed. The retained feature/faculty-history implementation uses ConnectedObservationHistory and ObservationHistory, backed by the opt-in development-only GET /api/me/observations prototype. The unused FacultyHistoryScreen duplicate has been removed. Real database records and submitted-form contract alignment remain follow-up work on a separate endpoint branch. The client component may receive only authorized past records, not all faculty records for client-side access filtering. Semester/status choices derive from those records rather than invented dates or lifecycle states. Form links require an actual authorized destination; no record URL is guessed.

No notification screen/route exists despite its inclusion in the reference sitemap. The header retains the accessible unavailable-notifications indicator instead of inventing a URL/action. In-app notifications are required MVP integration work; automated email is a stretch goal, not working behavior.

The shell keeps actual supplied identity or the missing-user/anonymous-avatar fallback. It does not inject names, initials, role summaries, or permission identifiers. AC/Admin remain omitted because no authorized bindings exist. Server authentication and per-record authorization still need integration; UI visibility is not authorization. There are no private records or client-side filters of other faculty's data.

## Visuals and checks

Faculty headers share the screenshot's 48px desktop inset, 32px header gap, 288px sidebar, semantic typography/palette/spacing, and shared Button/ButtonLink controls. Profile text is centered beside the 40px avatar. Non-Faculty component previews keep their previous shell defaults. Empty states necessarily differ from screenshot example records. A production render avoids the development badge without application configuration changes.

## Backend dependencies and document conflicts

- Connect authorized eligibility, cycles/deadlines/feedback windows, assigned sections/meetings, signups, released recommendations, invitation states/attempts/expiry/approval, final pairing, observations, assigned templates, participant acknowledgements, reports, history, feedback, and notifications. Draft endpoints are not assumed implemented.
- Enable role/stage-specific actions only from verified server context. Survey requires participation plus the actual open feedback period; no new survey route is added. No supported statement-upload route exists, so no upload UI or public storage is introduced.
- Older diagrams/API/schema describe signed document uploads. Current implementation notes and UC5 require web forms; no offline upload is reintroduced.
- Senior-project notes allow multiple observations/courses, while the observee diagram says one course per cycle. This UI selects one section per signup and adds no global signup cap; backend agreement is still needed.
- Follow UC3's up-to-five eligible recommendations over earlier meeting notes calling five merely an example. No matching, random final assignment, observer workload cap, or invented invitation limits are implemented in the browser.
- Senior-project meeting history mentions AC review before finalization while UC5 describes participant acknowledgement. Implementation notes defer the exact finalization policy. The preview neither finalizes a real record nor claims either approval flow works. Missing-history/rank-change eligibility, retry/cutoff policies, and precise feedback boundaries also remain server/team decisions.

Read Implementation_Notes.txt before integrating these behaviors. The final correction pass inspected the attached UC2-UC5/UC10/UC12, Faculty diagrams, frontend sitemap/pages, endpoint/structure draft, senior-project notes, and architecture/schema references.

## Final verification

Passed npm run lint, npx tsc --noEmit, npm run build, git diff --check, and all 20 Node unit tests (including navigation availability/authorization tests and the real layout's working History binding). No dependencies or package scripts were added to the project.

The earlier correction pass checked the original 10 canonical Faculty routes and their links, prerequisite guards, distinct appointment content, form flow, and mobile navigation. The later History fix separately checks clicking the sidebar link, `/observations/history`, active navigation, empty state, filter changes, direct access/reload, and mobile navigation without a 404.

The History browser check passed at desktop and mobile sizes: actual sidebar mouse clicks reached `/observations/history`, the page returned HTTP 200, History was the active item, all three filters and five table columns rendered, role changes updated the result count, reload/direct access worked, keyboard focus remained visible, and no page overflow occurred. Captures are in `.next/history-check/` as temporary build artifacts.

The dashboard and related rendered pages were visually inspected against the supplied Figma references. Sample records/semester/identity in those references cannot be treated as real Faculty records. The anonymous profile, missing AC/Admin authorization, missing non-dashboard cycle subtitle, and record-empty/disabled states are intentional integration limitations. The History page follows screenshot 12's filter/table layout with a real empty state rather than its sample records.

### October 28 History frontend alignment
The History UI now uses shared typography, radii and surface tokens and removes
custom shadows. It renders outside development and handles endpoint failures
through its normal retry/error states; preview state overrides are development-only.
Its list adapter supports the current nested semester shape. Its form dialog reads
the existing assessment/template contracts, including answer arrays, configured
comments and general comments. Missing submission timestamps display as unavailable.
Draft/submitted forms are not presented as finalized. The own-observation list
backend remains a development provider pending the separate endpoint branch.

Validation for the October 28 frontend pass: lint passed; the full Node suite
passed with one existing skipped test, and the focused adapter/API regression
suite passed all 23 tests. The existing History HTTP integration test passed
against localhost (authentication, three roles, ownership-scoped development
records, no-store, rejected identity parameters and logout). Webpack production
compilation succeeded; final build validation is blocked by existing optional
route-context type signatures in unrelated Admin/AC backend HTTP wrappers.
Turbopack separately failed while spawning its CSS processing worker. Browser
visual inspection has not been performed for this pass.
