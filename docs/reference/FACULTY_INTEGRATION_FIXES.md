# Faculty integration fixes ? October 29, 2026

Semester Settings already implements exact semester-zone datetime conversion, DST
validation, revision retention, read-only naming and Cancel restoration. This pass
verifies its frontend payload through two real saves/reloads in a disposable DB.

Finalized assessments can be reopened by both participants. Next/Back navigate all
three sections without saving; submissions remain blocked. Authorized reads retain
assigned templates and answers, including after the observation deadline. New blank
forms remain unavailable after that deadline. Faculty runtime business queries and
mutations now use Prisma model APIs, with Serializable writes, transaction-scoped
reads, unique signup keys and conditional workflowRevision updates for assessment writes.
Serialization/unique conflicts require explicit retry; no raw-query substitute is used.

Signup forms remount per selected cycle and ignore late success after unmount.
Expanded report/survey controls use a vertical action layout across the content width.
Accepted candidates show persisted start/end instants in their stored time zone;
missing details block confirmation. Signup dependency failures show an error/retry
instead of an empty-course message. Server diagnostics log only the error code.

## Semester management contract

- `POST /api/semesters`: `{year,season,startsOn,endsOn,timeZone}`. Year is 2000?2099,
  season is Spring/Summer/Fall, boundaries are valid ordered dates and zone is IANA.
  Returns the semester resource (201); duplicate term returns 409. Creating its cycle
  remains a separate existing Create Cycle action.
- `DELETE /api/semesters/{semesterId}`: JSON `{expectedRevision,expectedCycleRevision}`;
  use null for expectedCycleRevision only when there is no cycle. Returns
  `{deleted:true}` (200). Stale state returns 409; missing semester returns 404.
- Both require `cycles.manage`, current authentication, same origin, JSON, bounded
  bodies and no-store responses through the existing configuration HTTP adapter.
- Deletion removes the cycle, sections/meetings/teaching links, signups, observations,
  attempts/approvals, assessments, reports, feedback and attachment metadata in one
  Serializable transaction. Shared courses, users, professors and templates remain.
  Supporting files are removed only after commit; cleanup failures are logged and
  may leave inaccessible private files requiring operator cleanup.
- Semester Settings provides New Semester and an explicit permanent-deletion
  confirmation describing the affected records. No live semester was deleted in testing.

Admin account deletion already deletes all userRole links. Permissions are entirely
role-derived; shared roles/rolePermission records must survive account deletion.
The Admin integration test checks removed access and other users? retained grants.

Faculty History page, its routes, and shared ObservationDetails implementation are
unchanged. Shared-component test mocks were updated for current hooks/signup mounting.
Migration SQL and application data are unchanged.

## Verification

Populated PostgreSQL integration uses a disposable database and temporary private-file
folder. It covers 18 groups: eligibility/ownership, duplicate signup, invitation flow,
pairing races, expiry/approvals, separate acknowledgements/concurrent finalization,
finalized review, feedback/private files, API denial/origin, repeated settings saves,
and semester creation/deletion authorization, stale revision, rollback and dependencies.
Admin integration uses a disposable schema, including permission cleanup and shared
grant preservation. Unit regressions cover cycle remount/late responses, locked-step
navigation, error/empty distinction and configuration boundary authorization.
Validation passed: 256 unit tests, lint, TypeScript/production build, 18 populated
PostgreSQL check groups, isolated Admin integration, and live own-data workflow reads.
Controlled headless Edge browser checks also passed Semester Settings zone inputs,
two revision-aware saves, New Semester, delete Cancel/confirmation and cycle removal,
and content overflow checks at 1280px and 390px. All browser configuration writes were
intercepted. Report/survey layouts and Faculty cycle/form interaction have component
regression coverage; those populated screens were not exercised in a live browser.
