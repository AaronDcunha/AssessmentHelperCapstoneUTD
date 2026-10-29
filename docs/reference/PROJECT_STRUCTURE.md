# Project structure and implementation responsibilities

October 26 Faculty completion: own reads live in faculty-* queries; transactional
release/invitation/approval and participation rules live in faculty-* services.
Reuse configuration cycle scope and Admin effective permissions. db.ts handles
Faculty SQL timestamps/dates explicitly as UTC; authentication remains Prisma-based.
scripts/scheduler.ts is an explicit separate expiry/resend process, not a route-import
side effect. Private evidence uses storage outside public and database metadata.
See FACULTY_DASHBOARD_BACKEND.md and the additive Faculty migration. History is excluded.

October 25 authentication correction: database-auth.ts now uses getPrisma() model reads, including credentials and inherited permissions. Admin services atomically provision generated usernames and hashed local credentials. The pg authentication-pool references below are historical. See AUTH_BACKEND.md and ADMIN_BACKEND.md.

October 23 configuration update: cycle reads/mutations, semester lookup and atomic
settings, and editable draft/published templates are implemented. Shared HTTP
authorization/validation lives in `src/server/configuration-*.ts`, authorized reads
in `src/server/queries/configuration.ts`, and transactional writes in
`src/server/services/configuration.ts`. Configuration uses generated Prisma Client
model APIs and transactions via `src/server/prisma.ts`; no hand-written queries.
Prisma also manages schema/migrations. See `AC_CONFIGURATION_BACKEND.md` for the
current contract. The older versioning suggestions below are superseded for
templates by the October 18/23 implementation notes.

This is the target organization, not a list of implemented features. As of October 11, 2026, the app has a Next.js starter page, dependencies, local PostgreSQL/Mailpit services, and placeholder directories. Authentication, Prisma models, workflow APIs, dashboards, jobs, and tests remain to be implemented. Inspect the source for current progress.

October 14 update on the authentication backend branch: Auth.js JWT sessions, development-only mock identities, `/api/me`, shared access guards, protected test pages/APIs, and authentication tests are implemented. Database-backed authentication and all business models remain pending. See `AUTH_BACKEND.md`; the mock test permissions do not define the final database permission model.

```text
assessment-helper-capstoneutd/
  AGENTS.md                        Shared AI development instructions
  CLAUDE.md                        Imports AGENTS.md for Claude
  docs/reference/                  Requirements, decisions, and this guide
  prisma/
    schema.prisma                  Models, relations, unique constraints
    migrations/                    Versioned database changes
    seed.ts                        Demo users, ranks, courses, and cycle data
  src/
    auth.ts                        Auth.js Credentials/JWT setup
    app/
      layout.tsx                   Root application layout
      globals.css                  Shared styles
      page.tsx                     Entry page / eventual authenticated redirect
      (auth)/login/page.tsx         Login screen
      (main)/
        layout.tsx                 Authenticated shell
        dashboard/                 Professor status, signups, tasks, history
        observations/              Observation list and detail screens
        observations/[id]/         Candidates, pairing, assessment web form
        ac/                        Cycles, matching release, templates, reports
        admin/                     Users, roles, permissions, hiring levels
      api/
        auth/[...nextauth]/         Auth.js route handler
        me/                        Caller profile and personal workflow queries
        evaluation-cycles/         Deadlines, signups, matching, feedback, reports
        observations/              Invitations, pairing, assessment form lifecycle
        observation-candidates/    Responses and expired-invitation approval flow
        observation-templates/     Drafts, versioned criteria, publication
        notifications/             Own notifications/read state; AC announcements
        users/                     Admin account/profile and role assignments
        roles/                     Admin role management
        permissions/               Supported permission definitions
        hiring-levels/             Evaluation frequency configuration
    components/
      ui/                          Reusable inputs, buttons, dialogs
      layout/                      Navigation, header, shell
      shared/                      Status badges, empty states
      observations/                Invitation and assessment-form components
      ac/                          AC-specific interfaces
    server/
      db.ts                        Existing authentication pg pool
      prisma.ts                    Shared Prisma Client for business features
      permissions.ts               Permission, ownership, and scope checks
      services/                    Business rules and transactional mutations
      queries/                     Authorized database reads
      jobs/                        Expiry, resend, and email-delivery tasks
      email/transport.ts           Nodemailer SMTP transport
      email/templates/             Email content
      storage.ts                   Private supporting-feedback attachments
    schemas/                       Shared validation when a library is adopted
    lib/                           Formatting and shared non-server utilities
  scripts/
    scheduler.ts                   Separate process triggering scheduled jobs
    import-course-data.ts           Lecture-only CourseBook JSON import
  tests/
    unit/                          Eligibility, matching, lifecycle business rules
    integration/                   Authorization, constraints, transactions, APIs
    e2e/                           Complete user workflows
  compose.yaml                     Local PostgreSQL and Mailpit
  .env.example                     Documented placeholders, no real secrets
```

## Implementation boundaries

Route handlers validate input, establish identity, enforce access, and call services. Keep matching, deadline calculations, assessment finalization, and resend policies in shared server services rather than duplicating them across pages, handlers, and jobs. Server-rendered pages may call authorized queries directly. Client components must not access the database or secrets.

Translate the relational diagram into Prisma rather than treating it as executable schema. Web forms need structured assessment answers tied to criteria and the observation's template version. Define lifecycle/acknowledgement behavior with the team. Preserve prior template versions and lock finalized assessments according to the agreed workflow.

Invitation attempts and AC approval records must preserve history across resends. Final observer selection and cancellation of other invitations must update consistently in a transaction. Check expiry at response time even if the job has not run. Background jobs should be safe to rerun without duplicate invitations or notifications.

Enforce section ownership and cycle/semester consistency. Agree on signup and feedback uniqueness before adding constraints. Notifications are per recipient; email delivery attempts/retries need separate records if queued delivery is implemented. AC data scope must be explicitly defined and enforced.

Use private storage outside `public/` for supporting attachments, with authorized backend access. Signed assessment document storage is no longer part of scope. Never place faculty reports or private attachments in public assets.

## Dependencies and execution

The package currently includes Next.js, React, Prisma/PostgreSQL, Auth.js, Nodemailer, and node-cron. Installation does not mean integration is complete. Zod and the planned test frameworks are deferred; do not import them until added deliberately. Consult `README.md` and `package.json` for actual setup/scripts and dependency limitations.

Run the scheduler as an explicit separate process when implemented; do not start timers as a side effect of a route import. Local Mailpit captures development mail. UTD SSO is future integration; use the planned demonstration Credentials authentication unless the task changes that scope.

## Suggested build sequence

1. Resolve policies needed by the assigned feature; add Prisma models and demo data.
2. Implement authentication and server-side authorization.
3. Implement cycles, eligibility, sections, and signup.
4. Implement recommendation generation/release, invitations, responses, selection, expiry/resends, and AC late-acceptance approval.
5. Implement template versions, assessment web forms, completion, and history.
6. Implement feedback, operational reports, agreed KPIs, and notifications/email.

Build meaningful tests alongside business rules and access controls. Stretch goals should not block core workflows.

October 19 faculty/auth integration: the shared main layout now authenticates
and supplies user identity plus permission-filtered Faculty/Admin test navigation.
Root and successful logins default to /dashboard. Faculty route-family layouts
enforce read access. Business dashboard data remains preview/empty state.

October 25 Admin update: shared authorization/validation and HTTP handling live in src/server/admin-*.ts; authorized reads in src/server/queries/admin.ts; Serializable writes in src/server/services/admin.ts. See ADMIN_BACKEND.md for the implemented endpoints and remaining SSO/user-deletion limitations.

October 28 personal observation list: authorized Prisma reads and response mapping
live in src/server/queries/personal-observations.ts. The thin /api/me/observations
route supplies session identity and structured private responses. See
PERSONAL_OBSERVATIONS_BACKEND.md; existing Faculty pg aggregates are unchanged.

October 28 Notifications backend: shared validation/HTTP handling lives in
notification-validation.ts and notifications-http.ts, authorized inbox reads in
queries/notifications.ts, and read-state/shared creation in services/notifications.ts.
Route adapters are thin and Prisma operations use repeatable-read transactions.
Email delivery remains a documented future service/job; no mail implementation.

October 28 alerts/reminders: authorized reads are in queries/alerts.ts, workflow
mutations in services/alerts.ts and services/cycle-reminders.ts, and boundary
validation/HTTP adapters in alert-reminder-*.ts. Existing AC report filter helpers
are reused. One Serializable Prisma transaction owns each alert/reminder mutation;
email jobs remain unimplemented by explicit user instruction.


October 28 email delivery (supersedes earlier deferred-email notes):
New workflow notifications now default to both inApp and email. Additive migration
20261028020000_notification_email uses an INSERT-only trigger to atomically enqueue
both Prisma and existing pg writers, with no historical backfill or read-action
emails. A separate Prisma/Nodemailer job sends through local Mailpit, using
noreply_course_evaluation@assessmenthelper.edu, with claim leases and bounded
retries. AC reminders support email-only, inApp-only or both; channel choices are
in the idempotency hash. The frontend sends both and reports email as queued.
No public mail endpoint. See EMAIL_DELIVERY.md for setup and delivery limits.


October 28 faculty messages (supersedes alert lifecycle):
Faculty alerts are simple messages to AC, with no acknowledgement/resolution
workflow. PATCH /api/alerts/{alertId} is removed (405); lifecycle fields are omitted
from GET responses and status filtering is unsupported. Old records/audit fields
are retained. Every active AC account receives one in-app notification and queued
email, independently of alerts.manage. Admin and custom committee roles with
observations.read plus notifications.send remain included. Duplicate role membership
does not duplicate delivery. Messages include sender and full text; observation
access remains independently enforced. Multiple messages/retry keys remain supported.


October 28 unified Faculty observation details:
The current no-ID details route resolves the selected workflow observation and
uses the same ObservationDetails component/API as History. Cycle/observation
selectors and active form, non-occurrence, feedback, recommendation, pairing and
AC-message actions remain. Actions display only after the authorized details read
succeeds. History stays read-only. Assessment loading uses the current own grant;
proposed meeting options retain the shared labels, locations and time zones.
