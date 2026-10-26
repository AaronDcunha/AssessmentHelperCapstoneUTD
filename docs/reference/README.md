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

Authentication backend: see `AUTH_BACKEND.md` for the implemented development-only mock login, frontend integration contract, permission probes, and remaining database work.

| File | Use |
| --- | --- |
| `Implementation_Notes.txt` | Current decisions and remaining implementation questions |
| `PROJECT_STRUCTURE.md` | Proposed directories and responsibilities |
| `Expanded Use Cases.docx` / `.txt` | UC1–UC13 workflow descriptions; TXT is a paragraph-text extraction for AI/search |
| `process_explanation_to_all.docx` / `.txt` | Faculty/AC process and draft KPI definitions |
| `AssessmentHelper_API_Contract_Draft_v2.txt` | New Figma-reviewed API proposal with parameters, return shapes, access rules, screen coverage, and unresolved decisions; not implemented/approved contracts |
| `AssessmentHelper_API_Endpoints.txt` | Preserved earlier endpoint draft/backup; includes outdated assessment-upload routes |
| `AssessmentHelper_Relational_Schema.drawio` | Proposed relational model; assessment answers, invitation attempts/approvals, and relevant constraints need revision |

The TXT extracts aid reading; use the Word originals when table structure or formatting matters. Regenerate extracts when originals change. Treat older materials elsewhere in the workspace or the repository's presentation as historical context when they conflict with these decisions.

## Current scope

- Professors can act as observees and observers in the same cycle. Signups enter the observer pool.
- AC manages cycle deadlines, generates and releases recommendations, monitors progress, sends reminders, and reviews reports.
- Admin manages users, roles, permissions, and hiring levels. Enforce permissions and ownership on the server.
- Assessments use a web-based form with versioned criteria and stored answers. Define acknowledgement/finalization details before implementing them; do not build signed-document upload routes.
- Assistant professors require evaluation every year; associate/full professors every two years. Faculty due in a semester must sign up by that cycle's signup deadline. Signup is separate from observation completion.
- Automatic invitation resends and AC approval for accepting expired invitations are required work. Retry limits, approval-window behavior, and deadline cutoffs still need definition.
- Manual observer replacement and Department Head functionality are stretch goals; include them only when the task calls for them.
- KPI formulas and eligibility edge cases remain open as listed in the notes. Do not silently turn draft formulas or guessed policies into requirements.

## Maintaining this guide

Record agreed changes in `Implementation_Notes.txt` and update affected guidance, API drafts, and schema designs together. Distinguish confirmed decisions from proposals. No documentation edit alone implements a feature.
