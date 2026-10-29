# Alert and AC reminder endpoints

Implemented October 28, 2026. All new runtime persistence uses Prisma Client.
Email delivery now uses the transactional outbox and separate Mailpit worker; see EMAIL_DELIVERY.md.

## Endpoints

| Method and route | Access and behavior |
| --- | --- |
| POST /api/observations/{observationId}/alerts | Own observee only; requires observations.read.own and invitations.send.own. Creates a message and notifications for all active AC recipients in one transaction. Returns 201 for creation, 200 for an existing alert. |
| GET /api/evaluation-cycles/{cycleId}/alerts | observations.read; current AC university-wide scope. Supports type, departmentId, cursor, limit. |
| GET /api/alerts/{alertId} | observations.read for AC scope, or observations.read.own for the original reporting observee. A selected observer does not inherit access to another faculty member's alert. |
| POST /api/evaluation-cycles/{cycleId}/notifications | notifications.send plus cycles.read. Uses the shared in-app notification service; no second reminder endpoint or browser notification-creation API. |

All routes authenticate through the existing active-account/session resolver.
Private responses use no-store and structured {error:{code,message}} errors.
Mutations require same-origin JSON requests bounded to 64 KiB. Invalid/unknown
fields, invalid IDs, wrong grants, stale revisions and foreign records are rejected.
Serializable transactions protect concurrent writes; conflicts return 409 instead
of blindly replaying user actions. Raw database exceptions are not exposed.

## Faculty messages (current behavior)

Alerts are now messages sent to the Assessment Committee, with no acknowledgement,
resolution or message status workflow. PATCH /api/alerts/{alertId} is removed (405).
Read/unread remains per recipient through the notification endpoints. GET responses
omit lifecycle fields and return allowedActions:[]; status filters are unsupported.
The existing alert URLs remain for authorized message/observation context.

Faculty can send multiple messages per observation. Optional body creationKey UUID
deduplicates retries of one submission: same content/key returns its existing
message, changed content/key returns 409, and a new key creates a new message.
The form retains the key on failure and clears it after success. Creation accepts
reasonCode:OTHER, optional free-text reason (up to 2000 characters), details (up to
20000 characters) and optional creationKey.

Every active account assigned AC receives one in-app notification and one queued
email, without requiring alerts.manage. Admin accounts and custom committee roles
with both observations.read and notifications.send also receive the message.
Multiple matching roles do not duplicate delivery. Inactive accounts are excluded.
The persisted notification/email message includes the sender's name and full text.
Observation destinations and context reads still enforce current access; receiving
a message does not grant additional observation permissions.

Old messages, lifecycle audit fields and historical notifications are preserved;
these fields are no longer used in the API or UI. The old alerts.manage grant is
inert and is not seeded for new roles. No data-reset or destructive migration is
needed. Existing acknowledgement rules for assessment forms are unchanged.

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

channels defaults to ["inApp","email"]. Either channel or both are supported.
The dispatch returns 200 with
{dispatchId,recipientCount,notificationCount,emailQueuedCount,status:"completed"}.
Completed means the dispatch transaction committed, not that SMTP delivered mail.
Email is queued for the separate worker; no public operation-polling endpoint is
needed. See EMAIL_DELIVERY.md and NOTIFICATION_HELPER.md.

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
  candidate context and full read-only message.
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
  messages, all-active-AC delivery, concurrent retry/reminder requests, recipient
  filters, inactive exclusions, notification atomicity, rollback and email rejection.
- Existing populated Faculty regression passed all 15 groups in a disposable DB,
  including the legacy Alert AC route and notification workflows.
- Live HTTP checks passed anonymous/Faculty/AC/Admin access and error behavior,
  using only reads and rejected/missing-record mutations. No real alerts/reminders
  or email were created by those checks.
- Isolated browser fixtures passed alert-list navigation, observation/alert context,
  candidate display, absence of message lifecycle controls, reminder form with
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


Multiple-alert verification: the isolated PostgreSQL regression passed multiple
alerts on one observation (including pending/resolved predecessors), same-key
retries and conflicts, concurrent deduplication and one notification/email queue
row per new alert. The form test passed retained keys after errors and fresh keys
after success. All 15 populated Faculty regression groups passed; source types
and targeted lint passed. Migration 20261028030000_multiple_observation_alerts
was applied locally without resetting or changing existing alert records.


Simple-message verification: 233 unit tests passed, with the existing optional
SQL-plan check skipped. Isolated PostgreSQL tests verified all active AC recipients
without alerts.manage, Admin delivery, multi-role deduplication, inactive exclusion,
email queue creation, retained historical messages and per-submission retry keys.
Live HTTP checks confirmed PATCH returns 405 and read authorization remains intact.
The browser test confirmed full message/context viewing and no lifecycle controls.
Source TypeScript and targeted lint passed. No real messages were sent by these
regressions; existing application records were not modified.
