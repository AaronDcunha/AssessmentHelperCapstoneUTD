# Workflow email delivery

New workflow notifications request in-app and email delivery by default. The same
title and full message are sent as plain text and escaped HTML, one recipient per
email, from `Assessment Helper <noreply_course_evaluation@assessmenthelper.edu>`.
`MAIL_FROM` can override the sender. There is no public email-sending endpoint.

## Local Mailpit setup

Mailpit captures SMTP locally; it does not send to real inboxes. Keep PostgreSQL
and Mailpit running (`docker compose up -d postgres mailpit`), then:

```sh
npx prisma migrate deploy
npm run db:generate
npm run jobs:email
```

The worker is a separate process from Next.js and the faculty expiry scheduler.
Keep it running while testing; it checks the queue on startup and every minute,
up to 50 deliveries per batch. `npm run jobs:email:once` processes one batch.
The worker requires `EMAIL_DELIVERY_ENABLED=true`; stopping/disabling it retains
queued work. Local `.env` settings:

```dotenv
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM="Assessment Helper <noreply_course_evaluation@assessmenthelper.edu>"
EMAIL_DELIVERY_ENABLED=true
```

Open [Mailpit](http://localhost:8025) to see captured messages. Next.js running
inside Compose would use `mailpit` as the SMTP host. No real SMTP credentials are
needed locally. The SMTP transport uses patched Nodemailer 10.2.1 through the smtp-mailer npm
alias, with its built-in types. File/URL access and SMTP logging remain disabled.
Auth.js uses Credentials, so its older optional Nodemailer peer is not installed.
See DEPENDENCY_UPDATES.md for the compatibility decision and runtime upgrade.

## Transaction boundary and channels

Migration `20261028020000_notification_email` adds a one-to-one NotificationEmail
outbox and notification channel flags. An INSERT-only database trigger queues
email inside the original notification transaction. This deliberately covers
both Prisma workflow services and the existing pg acknowledgement/decline
writers without splitting their transactions or changing their workflow rules.
The delivery worker uses Prisma Client model operations; it does not use manual
SQL. The trigger is managed in the migration, so schema-push alone is insufficient.

For new integrations, use sendNotification(input, tx?) from services/notification-delivery.ts;
it defaults to in-app and accepts email:true. Existing workflows explicitly preserve
both channels. See [NOTIFICATION_HELPER.md](NOTIFICATION_HELPER.md) for examples.

The lower-level compatibility creation service accepts optional `channels: ('inApp'|'email')[]`,
defaulting to both. Recurring attempts for the same recipient/event keep the
original content/channel decision and do not create a second outbox row. Read,
unread and mark-all-read actions never queue email. Existing notifications are
not backfilled or emailed by migration. New legacy pg notifications default to
both channels. Workflow recipient selection remains unchanged.

The AC reminder endpoint accepts either or both channels; omitted channels mean
both. Email-only records stay out of inbox lists, counts and read mutations.
Channels are included in the idempotency hash (ordering is normalized). Response:
`{dispatchId,recipientCount,notificationCount,emailQueuedCount,status:'completed'}`.
Here completed means the dispatch transaction persisted, not SMTP delivery.
The frontend sends both channels and explicitly reports that email is queued.
The endpoint returns 200 after committing the dispatch, with no asynchronous
operations API. Reminder idempotency keys issued before this channel-aware hash
change can return 409 rather than being reinterpreted; submit a new request key.

## Delivery and failures

Workers use conditional Prisma claims and a five-minute lease. SMTP runs outside
database transactions with bounded connection/socket timeouts. Successful sends
are marked sent; inactive recipients are skipped. Transient failures retry after
1 minute, 5 minutes, 30 minutes and 2 hours, with at most five claimed attempts.
SMTP 5xx responses fail permanently. Exhausted work stays failed for operator
inspection; there is no public retry/delete job endpoint. These are technical
delivery limits, separate from invitation expiry/resend policies.

Only sanitized error codes are stored, never SMTP response text, credentials or
message bodies. A process crash can recover after the lease expires. Delivery is
at least once: SMTP acceptance followed by a crash before database confirmation
can cause a duplicate. A stable per-notification Message-ID identifies retries;
it cannot guarantee external mailbox deduplication. SMTP failures do not remove
in-app notifications or roll back the originating workflow.

## Verification

`node --env-file-if-exists=.env --env-file-if-exists=.env.local tests/integration/email-delivery.mjs --mailpit`
uses a disposable PostgreSQL schema and a fake `.invalid` recipient. It tests
historical exclusion, Prisma and legacy transaction rollback, event/read-state
deduplication, channel visibility, simultaneous workers, retry/backoff, permanent
failure, exhausted attempts, lease recovery, inactive recipients and escaped
templates. It verifies actual SMTP capture through Mailpit's API, including sender
and full message. The test email stays in Mailpit; database fixtures are removed.

The unit suite passed 232 tests with the existing optional SQL-plan test skipped.
The alert/reminder and inbox database regressions passed with transactional email
enqueue. All 15 populated Faculty regression groups passed. Live API checks and
the isolated AC browser test passed, including both reminder delivery channels.
Source TypeScript and targeted lint passed. Existing generated Admin/AC route
type errors remain outside this change.
