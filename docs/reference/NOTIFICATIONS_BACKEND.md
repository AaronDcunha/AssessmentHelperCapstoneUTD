# Notifications backend

Implemented October 28, 2026. All new notification endpoint reads/writes use
Prisma Client. Email delivery is explicitly deferred at the user's request.

## Endpoints and authorization

- GET /api/notifications requires notifications.read.own. Parameters:
  read=all|unread (default all), limit=1..100 (default 20), cursor?, after?.
  Returns {items,pageInfo:{hasMore,nextCursor},unreadCount,latestCursor}.
- GET /api/notifications/unread-count requires notifications.read.own and returns
  {unreadCount,asOf}; no query parameters.
- PATCH /api/notifications/{notificationId} requires notifications.read.own and
  notifications.update.own. Body is exactly {read:boolean}; response is the updated
  Notification. Reapplying read:true preserves the prior readAt. Setting read:false
  clears readAt. The server owns timestamps and updates both persisted read fields.
- POST /api/notifications/mark-all-read requires the same read/update grants and
  body {}. Returns {updatedCount,cutoff,unreadCount}.

The current active account/session comes from the existing auth layer. Every
record predicate includes the caller's userId; AC/Admin and notifications.send
never widen /api/notifications into other users' inboxes. Foreign/missing UUIDs
share a generic 404. Mock demo identities have no notification records. Reads and
updates return private/no-store responses. Mutations require an exact same origin,
JSON content type and bounded body (4 KiB). Unknown/duplicate/empty query parameters
and unknown body keys are rejected. Errors use {error:{code,message}} with access,
validation, missing-record, concurrent-update or generic unavailable status; database
error text is never returned.

## Paging and consistency

Lists order by createdAt descending, then notificationId descending. Opaque page
cursors contain their owner, read filter, after bound, snapshot upper time and
last row's timestamp/ID. The anchor must still be a notification belonging to the
caller. Cursors cannot be reused for another caller or filter. Read-state changes
may remove an anchor from the unread filter without invalidating its chronological
position. Keyset bounds prevent tied timestamps from skipping pages.

latestCursor is a separate owner-scoped timestamp watermark for after, including
an empty inbox. after means newly created records at or after that watermark;
its inclusive millisecond overlap deliberately replays boundary IDs so arrivals
with the same timestamp are not lost. Incremental clients must deduplicate IDs and
retain the original after bound while following page cursors. It is not a durable
change stream: edits/read-state changes and late commits with an older creation
time require a full refresh. The current frontend uses full refresh and page cursors,
not after. Tokens are validated, not treated as authorization or accepted as URLs.

Each endpoint operation runs in a RepeatableRead Prisma transaction. List/count
responses are consistent within that snapshot; unreadCount covers all own unread
records, independently of the read filter, page limit or chronological bounds.
Mark-all updates only own unread rows at/before the server cutoff visible in its
snapshot. Later timestamps and rows arriving after the snapshot remain unread.
The returned count is that transaction's snapshot, not a promise that no other
notifications can arrive immediately afterward. Concurrent write conflicts return
409 so the client refreshes rather than silently retrying a mutation.

## Destinations and existing records

The migration adds nullable targetKind, targetId and eventKey. Stored observation
references are resolved against current permissions and participation, not titles,
message text or arbitrary URLs. Own participants receive target kind observation
and the existing /observations/details?observationId=... destination. Authorized
university-wide readers receive acObservation and /ac/observations/{id} when they
are not using the own-record view. Without access, target is null. Destination
APIs independently check authorization again. An unselected invitation candidate
is not an observation participant; its observation destination remains unavailable.
Other destinations (invitation response, approval context, cycle signup) require
agreed record-aware target mappings; no guessed current-cycle URL is substituted.

Existing rows are retained. They have null target/event metadata rather than guessed
backfills. Historical isRead/readAt inconsistencies are normalized by the migration:
existing readAt is retained as evidence of read state; a read flag without a known
timestamp receives the migration normalization time, not a claimed historical open
time. A check constraint keeps future read states consistent. Target pairs are
constrained, and recipient/event uniqueness plus inbox/read-state indexes are added.
The migration 20261028000000_notifications was applied locally without reset/reseed.

## Shared workflow creation

createWorkflowNotification accepts a workflow transaction, recipient, eventKey,
type, title/message and optional observationId. It creates or returns the same
recipient/event notification using a unique constraint and Prisma upsert; retries
do not replace its contents or reset its read state. Notifications roll back with
their workflow. The endpoint does not expose a browser API for inventing messages.

Existing Prisma-based Faculty invitation, acceptance, decline, selection,
recommendation release/generation and committee issue notifications now use that
service with explicit event keys and observation context. Committee recipient
selection and workflow policies are preserved. Existing invitation attempt windows,
workflow state transitions and report semantics were not changed.

Legacy SQL-based Faculty acknowledgement/decline writers remain atomic in their
existing transactions. Their rows are listed/counted/updated by these Prisma APIs,
but remain without guessed destination metadata. They were not moved to a separate
Prisma transaction, which would break workflow/notification atomicity. Moving those
writers onto the common transaction boundary is part of the later delivery work.
No email is queued, sent, backfilled or retried by any code in this change.

## Email plan — not implemented

Most or all workflow notifications are expected to have an email counterpart;
confirm the event/channel matrix before enabling delivery. Keep type and eventKey
as the common event identity and reuse notification content/context instead of
creating a second independent notification pipeline.

A future additive outbox/delivery table should reference the notification and have
unique notification/channel identity, delivery status, attempts, next-attempt time,
and sanitized failure metadata. Enqueue it inside the same workflow transaction.
A separate trusted job should send email after commit and record delivery/retries;
SMTP failure must not roll back the workflow or remove its in-app notification.
Bring legacy Faculty writers onto this boundary before enabling email for them.
Read/unread changes must never create emails, and rollout must not automatically
send historical notifications. Agree templates, recipients, channel exceptions,
retry/backoff/terminal-failure policy and operational controls in that later task.
There is no new public email endpoint, SMTP transport, email scheduler, delivery
schema or email configuration in the current implementation.

## Verification

- node --test tests/unit/*.test.mjs: 222 passed, one existing skipped test.
- npm run lint and source-only TypeScript checks passed. Full generated route
  checking retains the previously documented Admin/AC optional-context errors.
- node --env-file-if-exists=.env --env-file-if-exists=.env.local tests/integration/notifications.mjs
  passed ownership, personal AC/Admin scope, authorized targets, tied-timestamp
  pagination, incremental overlap, read-state idempotence, cutoff/snapshot races,
  concurrent event deduplication, constraints and transaction rollback in a
  disposable local PostgreSQL schema. Application records were untouched.
- node tests/integration/notifications-http.mjs passed live local seeded Faculty,
  AC and Admin reads/count agreement, anonymous denial, rejected identity
  overrides, cross-origin rejection and generic missing-notification responses.
  It does not change any notification records.
- Existing populated Faculty regression passed all 15 check groups in a disposable
  database, including invitation retries, report notifications and acknowledgement
  atomicity. No email was sent in any test.
