# Project reference guide

Read this guide and `Implementation_Notes.txt` before implementing features. These files are kept inside the repository so teammates and their AI tools have the same project context.

## Authority and reading order

1. Follow the current task and any explicit team decisions supplied with it.
2. Read `Implementation_Notes.txt` for confirmed corrections, required work, stretch goals, and unresolved questions.
3. Read `PROJECT_STRUCTURE.md` for code placement and implementation boundaries.
4. Read the relevant use cases and process explanation for workflow details.
5. Consult the endpoint draft and relational schema for starting designs, applying the corrections above.

The original documents are preserved as supplied. They contain outdated requirements: signed assessment uploads have been replaced by web forms, and manual replacement is a stretch goal. The endpoint list and database diagram are proposals, not proof that features exist. Do not implement an older conflicting requirement just because it appears in a source document.

## Files

Faculty dashboard backend: see `FACULTY_DASHBOARD_BACKEND.md` for the live own-data query, private aggregate API, temporary cycle/eligibility assumptions, and focused checks.

Authentication backend: see `AUTH_BACKEND.md` for database-backed login, development-only mock fixtures, current grants, and the frontend integration contract.

| File | Use |
| --- | --- |
| `Implementation_Notes.txt` | Current decisions and remaining implementation questions |
| `ADMIN_BACKEND.md` | Implemented Admin endpoints, access rules, migration, safeguards and verification |
| `AC_CONFIGURATION_BACKEND.md` | Implemented configuration endpoints, access rules, migrations, and verification |
| `AC_CONFIGURATION_FRONTEND.md` | Issue #52 cycle/settings/template editor, unsaved preview, API integration and verification |

| `AC_MONITORING_FRONTEND.md` | AC list/cycle integration, business page guards, deferred work and verification |
| `AC_OBSERVER_SELECTION_FRONTEND.md` | Observer-selection Figma implementation, permissions, planned API integration and verification |
| `PROJECT_STRUCTURE.md` | Proposed directories and responsibilities |
| `Expanded Use Cases.docx` / `.txt` | UC1â€“UC13 workflow descriptions; TXT is a paragraph-text extraction for AI/search |
| `process_explanation_to_all.docx` / `.txt` | Faculty/AC process and draft KPI definitions |
| `AssessmentHelper_API_Contract_Draft_v2.txt` | API contracts and proposals; configuration endpoints marked COMPLETED are implemented, while unmarked endpoints remain planned |
| `AssessmentHelper_API_Endpoints.txt` | Preserved earlier endpoint draft/backup; includes outdated assessment-upload routes |
| `AssessmentHelper_Relational_Schema.drawio` | Proposed relational model; assessment answers, invitation attempts/approvals, and relevant constraints need revision |

The TXT extracts aid reading; use the Word originals when table structure or formatting matters. Regenerate extracts when originals change. Treat older materials elsewhere in the workspace or the repository's presentation as historical context when they conflict with these decisions.

## Current scope

- Professors can act as observees and observers in the same cycle. Observer eligibility does not require signup; all active professors are considered under the matching rules.
- AC manages cycle deadlines, generates and releases recommendations, monitors progress, sends reminders, and reviews reports.
- Admin manages users, roles, permissions, and hiring levels. Enforce permissions and ownership on the server.
- Assessments use a web-based form with stored answers linked to template records. In-place question edits are supported; major changes use a new template record. Define acknowledgement/finalization details before implementing them; do not build signed-document upload routes.
- Assistant professors require evaluation every year; associate/full professors every two years. Faculty due in a semester must sign up by that cycle's signup deadline. Signup is separate from observation completion.
- Automatic invitation resends and AC approval for accepting expired invitations are required work. Retry limits, approval-window behavior, and deadline cutoffs still need definition.
- Manual observer replacement and Department Head functionality are stretch goals; include them only when the task calls for them.
- KPI formulas and eligibility edge cases remain open as listed in the notes. Do not silently turn draft formulas or guessed policies into requirements.

## Maintaining this guide

Record agreed changes in `Implementation_Notes.txt` and update affected guidance, API drafts, and schema designs together. Distinguish confirmed decisions from proposals. No documentation edit alone implements a feature.

Personal observation list: see `PERSONAL_OBSERVATIONS_BACKEND.md` for implemented
GET /api/me/observations, personal ownership, database filters, pagination and tests.

Notifications frontend: see NOTIFICATIONS_FRONTEND.md for the Figma-based shared
page, header bell, read-state API clients and frontend-only verification scope.

Notifications backend: see NOTIFICATIONS_BACKEND.md for the four implemented
personal inbox/read-state APIs, migration and shared creation service. New notification runtime code uses Prisma Client.

Alerts/reminders: see ALERTS_REMINDERS_BACKEND.md for the implemented observation
alert create, cycle alert list, individual read-only alert review, and AC cycle reminder
endpoint, their frontend wiring and permissions.

AC Dashboard Alerts: see [issue #74 handoff](AC_DASHBOARD_ALERTS.md) for selected-cycle
Needs attention integration, read-only message review, verification and local URLs.

Email delivery: see EMAIL_DELIVERY.md for the transactional outbox, separate SMTP
worker, Mailpit setup, channel selection, retry handling and tests.


Shared notification helper: see [NOTIFICATION_HELPER.md](NOTIFICATION_HELPER.md) for the canonical sendNotification function, specific-user/list/role audiences, optional email, transaction examples and Mailpit testing.

Dependency/security updates: see [DEPENDENCY_UPDATES.md](DEPENDENCY_UPDATES.md) for
patched versions, the Node runtime target, known deferred majors, commit contents
and teammate installation steps.

AC observer selection: see [AC_OBSERVER_SELECTION_BACKEND.md](AC_OBSERVER_SELECTION_BACKEND.md)
for Issue #67's signup GET (signups.read) and Phase 1 AC-only candidate GET
(observations.read), provisional university-wide scope, persisted meeting/response
data, relevant teaching history, pagination and checks. The versioned-list foundation
and current-release guards are implemented; replacement regeneration/publication,
assignment archival and new Faculty candidate access remain deferred.

Faculty integration follow-up and semester New/Delete contract: see [FACULTY_INTEGRATION_FIXES.md](FACULTY_INTEGRATION_FIXES.md).
