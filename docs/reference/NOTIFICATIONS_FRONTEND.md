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
Opening View does not implicitly mark a notification read; explicit read actions
are separate. Target authorization is always rechecked by destination APIs.

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
