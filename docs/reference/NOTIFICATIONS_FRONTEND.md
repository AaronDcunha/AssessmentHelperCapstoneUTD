# Notifications frontend

Implemented from Figma Shared / Notifications / Desktop, node 16:3270:
https://www.figma.com/design/2fBuGKLRdHej1QAffDWsHr?node-id=16-3270

The /notifications page reuses the shared shell, Select, Button, TableCell and
TextAction components. It follows the 480px filter, 260px primary action and
Notification / Details / Action table proportions. The existing shared Figma
icons are reused; there are no new downloaded images. Dates, unread indicators,
individual read/unread actions, Refresh and Load more extend the reference to
support the API contract. No sample semester, identity or notifications are
injected into the live app. The header omits a semester when none is supplied by
real shared context. The table scrolls horizontally within its region on mobile.

This is frontend-only: no notification routes, migrations, emails or jobs were
implemented. A missing/malformed endpoint renders an unavailable/error state,
not sample rows or a false empty success.

## API contract

- GET /api/notifications?read=all|unread&limit=20&cursor=...
  consumes {items,pageInfo,unreadCount,latestCursor}. Notification fields follow
  Draft V2: {id,type,title,message,createdAt,readAt,target:{kind,id}|null}.
- GET /api/notifications/unread-count consumes {unreadCount,asOf}.
- PATCH /api/notifications/{notificationId} sends {read:boolean} and validates the
  returned Notification ID and requested read state.
- POST /api/notifications/mark-all-read sends {} and consumes
  {updatedCount,cutoff,unreadCount}. Loaded rows newer than cutoff remain unread.

The frontend uses cursor pagination only. It does not invent after/latestCursor
incremental semantics; Refresh obtains a fresh first page. Counts are supplied
by the server, not inferred from the loaded page. Requests use same-origin
credentials and no-store. Mutations use JSON; backend ownership, permission and
same-origin checks remain mandatory when those endpoints are implemented.

The controller cancels/discards stale list requests, serializes writes, preserves
rows on load-more errors, and clears private rows on 401/403. Unknown write outcomes
block further writes until an explicit refresh succeeds. It does not automatically
retry mutations. Marking a row read removes it from the unread view; mark-all
honors the server cutoff and count so new arrivals are retained.

## Access and navigation

The page requires notifications.read.own server-side. Individual/bulk mutation
controls require notifications.update.own. The shared bell is visible as a link
for notifications.read.own across Faculty/AC/Admin headers. Its badge calls the
count endpoint on mount, focus and read-state changes. Count failures omit the
badge and announce an unavailable count; they never report a fabricated zero.
The existing unavailable bell remains for users without the read grant.

The initial supported target convention is kind:"observation" with a UUID id:
it opens /observations/details?observationId=<id> when observations.read.own is
present. This reuses the authorized selected-record destination. Unknown/null
kinds, malformed IDs and unavailable grants show no active destination. API-supplied
URLs are never used. Additional target kinds must be agreed with the backend and
mapped to existing record-aware routes before enabling their View links.
Opening View displays the complete message in a dialog and marks it read when
notifications.update.own is granted. Optional authorized destination links appear
inside the dialog, never as the table action. Target authorization is always rechecked by destination APIs.

## Verification

Run node --test tests/unit/*.test.mjs, npm run lint, and source TypeScript checks.
The inherited full generated route checks still report optional-context signatures
in unrelated Admin/AC wrappers.

Browser regression: node tests/e2e/notifications.mjs with a local dev server,
seeded account credential file, and an isolated headless Edge/Chrome CDP port 9223.
It intercepts every notification API read and write in its own browser target;
fixture records never reach the application database. It covers Figma desktop
geometry, mobile overflow, pagination, all/unread, read/unread, cutoff-safe mark-all,
bell synchronization, destination links, empty, unavailable, 401 and 403 states.
Screenshots are written to OS temp as assessment-notifications-desktop.png and
assessment-notifications-mobile.png. Tests do not assert mail delivery or real
notification persistence, which belong to the backend follow-up.

Completed validation: 218 unit tests passed, one existing skip; lint passed;
source TypeScript checks passed with zero diagnostics. Desktop/mobile browser
checks passed and screenshots were visually compared with the Figma reference.
The select surface, table proportions, shared icon sizes and page spacing were
checked; test-only dates/read actions account for the taller notification rows.

October 28 backend follow-up: all four notification APIs are now implemented;
see NOTIFICATIONS_BACKEND.md. Approved targets additionally include acObservation
for existing authorized AC observation details. Email remains planned only.

## Selection and full-message viewing

Row checkboxes and Select all loaded support multi-selection. Mark selected as read
uses the existing individual PATCH API sequentially, skips already-read rows and
refreshes the unread count once. It does not call mark-all-read or imply selection
of unloaded pages. Filter changes/full refresh clear selection. Successful updates
are removed from selection; partial failure preserves confirmed updates and leaves
failed/unattempted rows selected. Uncertain writes block further writes until refresh.

The table clamps long messages to two lines. Every notification has a View button
that opens its full title/message/date in an accessible native dialog, including
when target is null or unsupported. Opening unread messages marks them read when
permitted; the dialog remains open even if the row disappears from the Unread view.
Read-only users may view without a PATCH. Read failures remain visible without
claiming success. The dialog has optional authorized destination actions, Escape
handling, focus restoration and a scrolling message area with visible Close.

Selection/detail validation: 227 unit tests passed, one existing skip. Source
TypeScript checks and lint passed. Isolated desktop/mobile browser checks passed
for selection, partial updates, two-line previews, automatic read marking, full
message dialogs with/without destinations, Unread-row removal, Escape/focus
restoration and mobile Close visibility. No account notifications were modified.
