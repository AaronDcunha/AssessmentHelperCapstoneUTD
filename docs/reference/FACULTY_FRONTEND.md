# Faculty frontend handoff

The Faculty screens use one account and one application shell. Observer/Observee participation belongs to an observation, not a second account or dashboard. No session reader, Faculty API handlers, authorized records, active cycle, or course fixtures exist in this checkout. All record screens therefore show prerequisite/empty states. Only the dashboard uses the screenshot's sample status, activity, and semester; these are display-only values, not persisted data or a real cycle. Its preview explanation stays in this handoff rather than an extra visible banner.

The current branch is Sai/faculty-dashboard. Existing dashboard/package edits were preserved. No backend, schema, authentication, AC, or Admin implementation was changed.

## Canonical routes and purpose

The later History-navigation fix adds the single canonical read-only route `/observations/history`. Other routes retain their existing paths and behavior.

| Route | Purpose and current behavior |
| --- | --- |
| /dashboard | High-level status, activity, and the three working Figma shortcuts to signup, current details, and incoming requests. |
| /dashboard/evaluation | Current eligibility/status, hiring level, last completed evaluation, cycle/deadlines, and a link to inspect signup. Missing data is unavailable; no eligibility rule is guessed. |
| /observations | Active work as Observer or Observee. Empty records plus signup/back navigation; no completed-history clone or menu offering every stage regardless of prerequisites. |
| /observations/history | Read-only completed/past observations across semesters. Semester, Observer/Observee, and status filters; semester, role, course/section, other professor, and status/form columns. Currently empty because no authorized history data source exists. No APIs or persistence added. |
| /observations/signup | One course section, proposed meeting date/time options, review, and submit/cancel. No cycle, eligibility, deadline, or assigned sections are available, so it explains the block and cannot create a signup. Submit gives validation/non-submission feedback. It no longer jumps directly to recommendations. Dates must come from section meetings and cycle deadlines; there is no fixed date count or global signup cap. |
| /observations/recommendations | Released candidates the Observee may invite. Empty candidate table; Send Requests is unavailable without candidates and selection. It does not imply acceptance/assignment or jump to accepted candidates. Back returns to the observation. Alert feedback explicitly says no notification was sent. |
| /observations/confirmed | Only accepted candidates for choosing one final Observer. Separate screen composition and accepted-only empty state; explains confirmation/cancellation. Back returns to the observation, not signup or recommendations. |
| /observations/requests | Incoming invitations for the current professor as Observer, distinct from outgoing recommendation/acceptance lists. No invitations are available. No fabricated response window, acceptance, decline, resend, or approval is shown. |
| /observations/details | Record status, participation, participants, course, overall progress, and actions. No record is available. View Observation Form opens the existing temporary preview; reporting and survey actions are unavailable with explicit prerequisites. |
| /observations/appointment | Confirmed class meeting: participants, course, date, time, location, appointment status and whether the observation occurred. Separate from overall progress. View Observation returns to Details. Mutation actions require a confirmed record and verified participation and are currently unavailable. |
| /observations/form | One stateful three-step preview: fixed rating questions/scale, long responses, comments/signatures. Ratings and preview signature are validated; Back/Next preserve entries, Cancel returns to Details, and final feedback explicitly reports no submission/save. Entries are lost on leaving/reloading. The Observee cannot be signed for by the Observer. Both authenticated signatures are required before any real record can be finalized/locked. |

The recommended/accepted tables share presentation only. Details and Appointment share field rendering only. Their screen purposes, fields, actions, and back links are independent.

## History, notifications, identity and scope

The sidebar contains Dashboard, My Evaluation, Observer Requests, Observations, and **History**. History now links to `/observations/history` and uses the existing active-link matching. The user explicitly authorized this simple read-only frontend after the earlier exclusion; no other page behavior or navigation authorization changed. Records remain empty until an authorized server query is available. The client component may receive only authorized past records, not all faculty records for client-side access filtering. Semester/status choices derive from those records rather than invented dates or lifecycle states. Form links require an actual authorized destination; no record URL is guessed.

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
