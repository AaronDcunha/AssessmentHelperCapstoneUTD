# Sending notifications and optional emails

Use **`sendNotification`** from `src/server/services/notification-delivery.ts` for
new server workflows. It resolves recipients, removes duplicates, saves the in-app
notification and optionally queues email. Teammates do not need to write inbox
inserts, find AC accounts, configure SMTP, or implement email retries themselves.

```ts
import { sendNotification } from "@/server/services/notification-delivery";
```

This is an internal server helper, not a public API or a client component action.
The calling service must authorize the operation and access to its records and
recipients. Do not pass arbitrary browser-supplied audience selectors through to
this helper. Receiving a notification does not grant access to its observation.

## One person: in-app only

```ts
await sendNotification({
  recipients: { userId: recipientUserId },
  eventKey: `assessment-submitted:${assessmentId}`,
  type: "ASSESSMENT_SUBMITTED",
  title: "Your assessment is available",
  message: "Your observer has submitted the assessment. Please review it.",
  observationId, // Optional authorized observation destination.
});
```

`userId` is an **AppUser account UUID**, not a Professor/profile ID, username or
email address. The helper finds the account's email when the worker delivers it.
It supports application accounts, not arbitrary external email addresses.

## All AC members, with email

```ts
await sendNotification({
  recipients: { role: "AC" },
  eventKey: `faculty-issue:${issueId}`,
  type: "FACULTY_ALERT",
  title: "Faculty needs assistance",
  message: `From: ${senderName}\n\n${reason}\n${details}`,
  observationId,
  email: true,
});
```

Every active AC account is included, independently of the retired `alerts.manage`
permission. Admin accounts also qualify because Admin inherits AC in the existing
role model. An account assigned AC and Admin gets **one** notification/email.
Role names are exact, case-sensitive database names. Custom roles work too:
`recipients: { role: "My custom role" }`.

## Several people, or combine audiences

```ts
await sendNotification({
  recipients: [
    { userIds: [firstUserId, secondUserId] },
    { role: "AC" },
  ],
  eventKey: `cycle-published:${cycleId}`,
  type: "CYCLE_PUBLISHED",
  title: "Evaluation cycle published",
  message: "The new evaluation cycle is ready to review.",
  email: false, // Optional: this is already the default.
});
```

An array means **union**: include anyone matched by any selector, once. For a
permission-based committee instead of a named role:

```ts
recipients: { permissions: ["observations.read", "notifications.send"] }
```

One permission selector requires **all** listed effective permissions. Permissions
from separate assigned roles combine, including normal role inheritance. For
example, faculty messages currently combine `{ role: "AC" }` with that permission
selector so custom committee roles remain included. Existing invitation approval
notifications retain their `late-acceptance.review` audience.

## Delivery options

| Option | Default | Behavior |
| --- | --- | --- |
| `inApp` | `true` | Show in Notifications and unread counts. |
| `email` | `false` | Queue email using the same title and full message. |
| `observationId` | omitted | Store observation context; inbox APIs resolve a destination only when the recipient is authorized. |

Both channels: `email: true`.

Email only: `inApp: false, email: true`. The internal notification record supports
delivery, but is hidden from inbox lists, unread counts and Dashboard activity.

In-app only: omit both flags, or use `email: false`.

`inApp: false, email: false` is invalid. Delivery flags must be booleans.
Title, message and type are plain text. Email HTML is escaped by the shared
template. Sender/SMTP settings are centralized; callers cannot override them.

## Keep notification creation atomic with your workflow

When changing a record and notifying people, pass that workflow's Prisma
transaction as the **second argument**:

```ts
import { getPrisma } from "@/server/prisma";
import { sendNotification } from "@/server/services/notification-delivery";

await getPrisma().$transaction(async (tx) => {
  // Perform the already-authorized workflow mutation using tx.
  const issue = await tx.facultyIssue.create({ data: authorizedIssueData });

  await sendNotification({
    recipients: { role: "AC" },
    eventKey: `faculty-issue:${issue.issueId}`,
    type: "FACULTY_ALERT",
    title: "Faculty needs assistance",
    message: issue.details,
    observationId: issue.observationId,
    email: true,
  }, tx);
}, { isolationLevel: "Serializable", timeout: 30000 });
```

Pass the actual `tx`, **not** the root Prisma client. If the workflow fails, its
notifications and email queue entries roll back together. If no transaction is
provided, the helper opens its own Serializable transaction for the complete
dispatch. Do not use that standalone form inside an unrelated transaction.
Concurrent-transaction errors propagate; callers may retry using the same stable
event key and their normal workflow conflict handling.

Older pg-based acknowledgement/decline writers already enqueue email atomically
through the notification INSERT trigger. Do not pass a pg Client to this Prisma
helper or open a separate Prisma transaction inside those pg workflows. Migrate
the whole workflow transaction before changing that integration. The lower-level
`createWorkflowNotification` remains for compatibility/internal persistence; new
features should use `sendNotification`.

## Event keys, results and validation

Use a stable `eventKey` identifying **one workflow event**, such as
`invitation:${attemptId}` or `assessment-submitted:${assessmentId}:${revision}`.
The same key and recipient return the same notification without resetting read
state, replacing content/channel settings, or sending another email. Generate a
new key for a deliberately new message; do not generate a new random key on every
retry. Callers must not reuse one key for unrelated events.

Audience membership is evaluated at call time. Retrying a broadcast after role
membership changes can reach newly eligible recipients for the first time; it
does not resend to existing recipients. If a workflow needs a frozen audience,
persist its recipient list with the workflow and pass those user IDs.

Result:

```ts
const result = await sendNotification(input, tx);
// {
//   recipientCount: number,
//   recipientIds: string[],
//   notificationIds: string[],
//   skippedUserIds: string[]
// }
```

Only active accounts qualify. `skippedUserIds` lists explicitly requested account
IDs that were missing or inactive. Overlapping users/roles are deduplicated.
An empty user list, unknown role or audience with no active matches returns zero;
the caller decides whether that is acceptable. Invalid selectors or content throw
before persistence. No arbitrary full-database audience is supported.

Limits: event key 300 characters, type 100, title 2000, full message 20000. Record
IDs must be UUIDs. There is no automatic truncation of full messages. Large
audiences must fit the calling transaction's timeout; use an appropriate trusted
batch job for workloads beyond that, keeping per-recipient event keys stable.

`recipientCount` counts resolved recipients, including existing event records on
retry. It does **not** mean a new notification was created or that SMTP delivered
an email. SMTP runs after commit, outside the request's database transaction.

## Email worker and Mailpit

With local Mailpit running, set `EMAIL_DELIVERY_ENABLED=true` and run:

```sh
npm run jobs:email
```

Keep this process running separately from `npm run dev`. It checks on startup and
every minute. `npm run jobs:email:once` processes one batch. An in-app notification
can appear before its email is delivered; `email: true` means **queued**. If the
worker is stopped, mail stays queued. `email: false` creates no queue entry.

Captured messages are at [Mailpit](http://localhost:8025). The sender is configured
centrally as `Assessment Helper <noreply_course_evaluation@assessmenthelper.edu>`.
See [EMAIL_DELIVERY.md](EMAIL_DELIVERY.md) for SMTP settings, migration/trigger
requirements, sanitized failure codes, retry/backoff and at-least-once delivery
limits. Read/unread changes never send email, and historical records are not
automatically backfilled.

## Verification

```sh
node --env-file-if-exists=.env --env-file-if-exists=.env.local tests/integration/notification-helper.mjs --mailpit
```

This uses a disposable local schema and fake `.invalid` recipients. It verifies
specific users/lists, AC/Admin inheritance, custom permission audiences, inactive
exclusion, overlapping-role deduplication, opt-in/email-only delivery, retries,
validation, transaction rollback and the standalone form. Mailpit captured exactly
one email for each of the three active AC/Admin fixture accounts. Test emails stay
in Mailpit; database fixtures are removed. Alert/reminder and all 15 populated
Faculty integration groups also passed through the migrated callers.
