# AC configuration backend

Implemented October 23, 2026. This document and the corresponding implementation notes resolve the configuration-specific proposals in API Contract Draft V2.

## Access

Every route requires an active Auth.js account. Current database permissions are reloaded through `getCurrentUser`; role names and client-provided identity do not grant access. Reserved mock identities have no configuration business grants.

| Operation | Required effective permission |
| --- | --- |
| Create/edit cycles; save semester settings | `cycles.manage` |
| Read every cycle/semester | `cycles.read` or `cycles.manage` |
| Read relevant cycles/semesters | `course-sections.read.own`, `signups.read.own`, or `observations.read.own` |
| Create/edit/publish templates | `templates.manage` |
| Read draft and published templates | `templates.read` or `templates.manage` |
| Read published templates | `assessment.read.own` |

AC configuration is university-wide. Faculty cycle reads are limited to cycles whose semester they teach in, their own signups, assigned observations, or observer candidacies. Faculty semester lookup uses their teaching assignments. Faculty cannot mutate configuration or read draft templates.

All responses, including errors, use `Cache-Control: no-store`. Mutations require `Content-Type: application/json` and an `Origin` matching the request URL origin; cross-site fetch metadata is rejected. Frontend calls should use relative same-origin URLs. If using curl/Postman, explicitly set the matching Origin and session cookie. Bodies are limited to 256 KiB. Inputs and UUIDs are validated and unknown body fields rejected. All configuration reads and writes use generated Prisma Client model methods, without raw queries. Business services independently enforce permissions as well as route checks.

Errors: `{error:{code,message}}`, with 400 malformed JSON, 401 unauthenticated/inactive, 403 unauthorized/origin, 404 missing or out of scope, 409 duplicate/stale/invalid transition, 413 body too large, 415 media type, 422 invalid fields. Creates return 201; reads/updates/publication return 200.

## Cycles and semester settings

- `GET /api/evaluation-cycles`: `semesterId?`, `status?`, `cursor?`, `limit?`.
- `GET /api/evaluation-cycles/{cycleId}`.
- `POST /api/evaluation-cycles`: `{semesterId,signupDeadline,observationDeadline,feedbackDeadline}`.
- `PATCH /api/evaluation-cycles/{cycleId}`: `{expectedRevision,signupDeadline?,observationDeadline?,feedbackDeadline?}`; at least one changed deadline field is required.
- `GET /api/semesters`: `year?`, `season?: Spring|Summer|Fall`, `cursor?`, `limit?`.
- `PUT /api/evaluation-cycles/{cycleId}/settings`: body shown below.

```json
{
  "expectedCycleRevision": 0,
  "expectedSemesterRevision": 0,
  "semester": {
    "startsOn": "2026-08-20",
    "endsOn": "2026-12-20",
    "timeZone": "America/Chicago"
  },
  "deadlines": {
    "signupDeadline": "2026-10-31T23:59:00Z",
    "observationDeadline": "2026-11-30T23:59:00Z",
    "feedbackDeadline": "2026-12-07T23:59:00Z"
  }
}
```

The settings response is `{semester,cycle}`. Both revisions increment atomically. `timeZone` is optional and preserves the stored zone if omitted. Start/end dates are required for this save and may be equal. Existing semester boundaries are null until configured; no academic dates are fabricated by the migration.

There is one cycle per semester, enforced by a unique index. Migration stops if legacy duplicate cycles exist rather than deleting them. New cycle names reuse the semester name. `signupDeadline < observationDeadline < feedbackDeadline` is enforced on writes. Passed deadlines may be edited and periods may reopen. Deadlines need not fall within semester boundaries; feedback may occur afterward. Timestamps must be valid UTC ISO strings ending in Z; dates use YYYY-MM-DD.

Cycle responses contain `{id,semester,signupDeadline,observationDeadline,feedbackDeadline,status,revision,allowedActions}`. Semester contains `{id,name,year,season,startsOn,endsOn,timeZone,revision}`. Name maps from `termName`; year/season derive from the existing YYs/YYu/YYf term code (unsupported codes yield a null year/season). This does not change `Section.semesterId` or Faculty History's separate contract work.

Status is derived from current UTC time: `signup` through the signup deadline, `observation` through the observation deadline, `feedback` through the feedback deadline, then `closed`. Deadline instants are inclusive for this display status. The list does not choose one current cycle when different semesters overlap. Authorized managers receive `allowedActions: ["update","updateSettings"]`; other readers receive `[]`.

Lists return `{items,pageInfo:{nextCursor,hasMore}}`, sorted by UUID ascending. Default limit 20, maximum 100. Cursors are the last returned UUID. Lists expose no total count.

## Templates

- `GET /api/observation-templates`: `status?: draft|published`, `cursor?`, `limit?`; summary items contain `{id,title,status,publishedAt,revision}`.
- `GET /api/observation-templates/current`: most recently published active template; publication time descending, UUID descending as a tie breaker. Returns 404 if none exists. Applicability is global, so `cycleId` is rejected.
- `GET /api/observation-templates/{templateId}`: full template.
- `POST /api/observation-templates`: `{title,criteria,commentPrompts?,signatureLabels?}`; creates an inactive draft.
- `PATCH /api/observation-templates/{templateId}`: `{expectedRevision,title?,criteria?,commentPrompts?,signatureLabels?}`.
- `POST /api/observation-templates/{templateId}/publish`: `{expectedRevision}`; activates a complete draft and records publication time. Already published returns 409.

Full templates contain `{id,title,status,publishedAt,revision,criteria,commentPrompts,signatureLabels}`. There is no separate version field/model. PATCH supports drafts and published records, following the October 18 decision. Editing a published template does not republish it or change its priority for `/current`. Previously published records remain readable and linked assessments are not reassigned.

October 27 creation retry protection: POST also accepts optional `creationKey` (UUID).
The editor supplies one key per creation attempt and reuses the exact payload/key on
retry. A unique nullable `creation_key` and a `creation_hash` bind the request to its
creator and original content (JSON property order is ignored). Replays return the
existing template's current representation without rewriting it or its criteria;
concurrent requests converge on one record. Reusing a key with different content or
a different creator returns 409 `CREATION_KEY_REUSED`. Existing clients may omit the
key, but then do not receive retry protection. Keys/hashes are not in public responses.
Replayed POSTs retain the existing 201 response convention. The additive migration
`20261027000000_template_creation_idempotency` is applied locally; no reset/reseed.
The isolated configuration integration suite verifies lost-response recovery,
concurrent retries, creator/content mismatch, later edits and independent keys.

Each criterion is `{id?,key,prompt,type,required,order,options?,weight?}`. Types are `rating` and `text`; rating options are `{value: integer,label}` with unique values. Criterion keys, supplied IDs and nonnegative integer orders must be unique in the template. There must be 1-100 criteria; rating criteria require 2-20 options. Weight defaults to 1 and must be finite/nonnegative. Text criteria cannot have options.

Supplied arrays replace that section; omitted sections remain unchanged. Preserve criterion IDs when editing existing questions, including order swaps. Foreign IDs are rejected. Removing criteria is blocked once any assessment references the template; create a new template for major changes. Editing existing question text intentionally changes what older linked assessments display. Stored assessment response JSON is not rewritten.

Comment prompts are `{id?,prompt,required,order}`; generated IDs are returned when omitted. Signature labels default to `{observer:"Observer",observee:"Observee"}`. Revisions start at 0 and increment on PATCH/publish. Stale writes return 409. Existing active seeded templates migrate to published; existing rating ranges get numeric option labels, while new seed inserts use descriptive scale labels.

## Migration and verification

Start local PostgreSQL, then run `npx prisma migrate deploy` to apply the additive migration. It does not reset/reseed application data. `npm run db:setup` also deploys migrations and runs the repeatable demo seed; use it only when you want that seed workflow. The seed preserves existing AC edits. `npm run db:generate` generates the ignored Prisma Client from the schema; `npm run dev` and `npm run build` generate it automatically through their pre-scripts. Generate after schema changes and before standalone tests/type checking on a fresh checkout.

`src/server/prisma.ts` provides a lazy singleton Prisma Client using the installed PostgreSQL adapter. Query modules use relation filters for faculty scope and include/select for response data. Services use Prisma `$transaction` and conditional revision updates (`updateMany` with the expected revision and an increment) to prevent lost writes. A stale semester revision rolls back the cycle update too. Prisma constraint/transaction errors are mapped to the existing API error codes. Authentication continues to use its pre-existing implementation; this refactor changes configuration persistence only.

```text
node --test tests/unit/*.test.mjs
node --env-file-if-exists=.env tests/integration/configuration.mjs
node tests/integration/configuration-http.mjs
npx prisma validate
npx tsc --noEmit
npm run lint
```

Integration tests require local PostgreSQL and permission to create/drop a temporary schema. They apply the checked-in migrations, then use Prisma for fixtures, reads/writes, faculty scope, pagination, publication, retained assessment answers, stale/concurrent updates and atomic settings. SQL in the test harness is confined to schema creation/removal and executing migration files. Only the randomly named temporary schema is removed; application tables are untouched. HTTP security tests exercise the same wrapper used by all configuration routes.

`configuration-http.mjs` additionally requires a running, seeded development server (default `http://localhost:3000`, override `TEST_BASE_URL`). It signs in as the existing seeded Faculty/AC/Admin accounts and verifies every route, including denied direct mutations and foreign-origin requests. It does not modify application records. Development fixture accounts named `faculty`, `ac`, and `admin` intentionally do not have configuration business permissions; use seeded accounts for these checks.
