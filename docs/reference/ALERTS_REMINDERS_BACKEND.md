# Alert and AC reminder endpoints

Implemented October 28, 2026. All new runtime persistence uses Prisma Client.
Email delivery remains explicitly deferred; no SMTP, outbox or mail job was added.

## Endpoints

| Method and route | Access and behavior |
| --- | --- |
| POST /api/observations/{observationId}/alerts | Own observee only; requires observations.read.own and invitations.send.own. Creates a pending alert and handler notifications in one transaction. Returns 201 for creation, 200 for an existing alert. |
| GET /api/evaluation-cycles/{cycleId}/alerts | observations.read; current AC university-wide scope. Supports status, type, departmentId, cursor, limit. |
| GET /api/alerts/{alertId} | observations.read for AC scope, or observations.read.own for the original reporting observee. A selected observer does not inherit access to another faculty member's alert. |
| PATCH /api/alerts/{alertId} | observations.read plus alerts.manage. Revision-checked acknowledgement/resolution and reporter notification are atomic. |
| POST /api/evaluation-cycles/{cycleId}/notifications | notifications.send plus cycles.read. Uses the shared in-app notification service; no second reminder endpoint or browser notification-creation API. |

All routes authenticate through the existing active-account/session resolver.
Private responses use no-store and structured {error:{code,message}} errors.
Mutations require same-origin JSON requests bounded to 64 KiB. Invalid/unknown
fields, invalid IDs, wrong grants, stale revisions and foreign records are rejected.
Serializable transactions protect concurrent writes; conflicts return 409 instead
of blindly replaying user actions. Raw database exceptions are not exposed.

## Agreed alert behavior

The user confirmed two actions: acknowledge an alert, then resolve it. State flow:
pending -> acknowledged -> resolved. Resolved is terminal; no reopening or automatic
observer replacement is implemented. The existing unique observation/reporter/kind
constraint preserves the previous one-alert-per-observation behavior, including
retries through the older Faculty issue route. Reposting does not overwrite the
reason/details or create a second committee notification.

The user confirmed preserving free-text reasons. Creation accepts the contract's
{reasonCode:"OTHER",details} with an additive optional reason string for the existing
Faculty form. The generic OTHER code is the only enabled code until a team-approved
reason list exists. The free-text reason is limited to 2000 characters and details
to 20000. Old alert rows retain their original reason/details.

PATCH takes {status:"acknowledged"|"resolved",expectedRevision,resolutionNote?}.
Resolution notes are optional, up to 2000 characters. The server records actor,
acknowledgement/resolution timestamps and increments the revision. Direct pending
to resolved, reopening, stale revisions and repeated transitions are rejected.
allowedActions reflects current state and effective permissions.

The additive migration gives default AC/Admin roles alerts.manage and increments
changed role revisions so pre-migration role edits cannot silently erase the grant.
Custom roles require explicit assignment; a role name alone never authorizes a
request. Committee recipients must have both alerts.manage and observations.read.

Alert reads attach linked observation, section/semester, participants and current
candidate context server-side. This is current linked context, not a historical
snapshot. Faculty cannot see unreleased recommendations through this endpoint;
AC may view candidates with its observation read grant. Neither form answers nor
private feedback attachments are exposed. Missing/foreign alerts return generic
404 responses. The existing observation details read now supplies a pendingAlert
reference only to its own observee or scoped AC readers, not merely any observer.

## In-app reminders

Body: {kind,recipientFilter,channels?,message?}. kind is a bounded descriptive
lowercase token, not a new workflow-state enum. The default generic message is
"Please review your evaluation-cycle tasks."; the AC form supplies custom text.

recipientFilter supports departmentId, hiringLevelId, professorIds,
evaluationStatus and observationStatus, intersected on the server. Professor IDs
are profile IDs, not account IDs. Only active faculty profiles are selected.
Evaluation statuses reuse existing AC report calculations and additionally require
reports.read; observation statuses reuse the AC observation predicate and require
observations.read. Observation status filters target actual observees and selected
observers in that cycle. An empty filter targets the same university-wide active
faculty population used by AC faculty reporting, not arbitrary account recipients.
The synchronous implementation limits recipients to 1000 and asks for narrower
filters beyond that limit. Existing eligibility ambiguities remain unchanged.

channels defaults to ["inApp"]. Any request including email fails with 501
EMAIL_NOT_ENABLED before any dispatch or notification is created; channels are
never silently dropped. In-app delivery is synchronous, so 200 returns
{dispatchId,recipientCount,notificationCount,status:"completed"}; no 202 operation
polling endpoint or background delivery job is necessary.

Optional Idempotency-Key is a UUID. A ReminderDispatch audit record and per-recipient
notification event keys are committed with the notifications. Reusing the same key,
actor, cycle and body returns the saved outcome; conflicting reuse returns 409.
Without a key, each authorized POST is a separate send. The frontend retains a key
across ambiguous failures and clears it after confirmed success. Retry results use
the original recipient count rather than silently notifying newly matching users.
No reminder is sent automatically by a read or page render.

## Frontend integration

- Existing Faculty Alert AC uses the canonical observation alerts POST. The old
  dashboard issue action delegates ALERT to the same creation service; it does not
  create a competing alert record or duplicate notifications.
- AC Observation Progress has a cycle alert list. View alert opens the existing
  observation details destination with its selected alertId. The shared context
  panel validates the observation/alert pairing and displays reason, details,
  candidate context, acknowledgement and resolution actions.
- Existing observation details can display its pending alert for an authorized
  observee/AC viewer. Resolution notes and terminal state remain accessible through
  the cycle alert list's explicit alert link.
- AC Faculty Due/Overdue and Observation Progress have permission-gated reminder
  controls using the current filters and explicit message submission. A single
  cycle is required; the All semesters view cannot trigger a multi-cycle send.
- Successful actions refresh the shared notification badge. No new Figma page or
  duplicate observation-details screen was introduced.

## Migration and verification

20261028010000_alerts_reminders adds alert revisions/audit columns, the handler grant,
and ReminderDispatch. It was applied locally without reset/reseed or fake alerts.
It preserves existing FacultyIssue records and the prior notification migration.

- Unit suite: 231 passed, one existing optional SQL-plan test skipped.
- Source TypeScript checks and lint passed.
- Isolated PostgreSQL integration covers ownership, candidate privacy, duplicate
  alerts, lifecycle/revisions, concurrent acknowledgement/reminder requests, recipient
  filters, inactive exclusions, notification atomicity, rollback and email rejection.
- Existing populated Faculty regression passed all 15 groups in a disposable DB,
  including the legacy Alert AC route and notification workflows.
- Live HTTP checks passed anonymous/Faculty/AC/Admin access and error behavior,
  using only reads and rejected/missing-record mutations. No real alerts/reminders
  or email were created by those checks.
- Isolated browser fixtures passed alert-list navigation, observation/alert context,
  candidate display, acknowledgement/resolution notes/revisions, reminder form with
  idempotency key, and mobile overflow. All business APIs were intercepted.

Inherited checks remain separate: full generated route types still hit optional
context signatures in older Admin/AC wrappers. A read-only Prisma drift check also
reports older Faculty workflow foreign keys whose October 26 SQL migration omitted
ON UPDATE CASCADE while Prisma relations default to Cascade. Its reported changes
concern existing columns/constraints, not these new alert/reminder tables or audit
fields. No unrelated foreign-key behavior was changed to silence that check.


## Email delivery update

The earlier in-app-only/501 behavior is superseded by EMAIL_DELIVERY.md. Reminders
accept email and/or inApp, default to both, and return emailQueuedCount. Workflow
alerts also queue email alongside their in-app notifications. The frontend requests
both and describes email as queued. The outbox commits with the workflow; a
separate worker sends through Mailpit. No historical email backfill occurs.
