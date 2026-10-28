# Admin backend

October 25 deletion follow-up: `DELETE /api/users/{userId}` is now implemented, bringing the requested Admin operations plus this follow-up to 14. Requires users.manage and the same origin checks as other writes. No body; success is empty 204, missing account 404. Physical deletion atomically removes credentials, role links, owned notifications and an unreferenced professor profile. It blocks self-deletion, loss of the last managing Admin, and any teaching/signup/selected-observer/candidate/feedback reference with 409. Historical records are neither removed nor anonymized; use accountStatus=false when deletion is blocked. Serializable isolation protects concurrent changes. No schema migration is needed. Existing frontend Delete User calls this handler. Unit tests, TypeScript, ESLint and isolated PostgreSQL integration passed, including successful removal/login rejection, missing users, self/last-Admin protection, rollback and preservation of selected-observer identity. Application accounts were not deleted during verification.

Implemented October 25, 2026. The existing Admin frontend uses these handlers without a new client contract. Apply committed migrations with `npx prisma migrate deploy` before running the updated app. Generate the client with `npm run db:generate`.

| Endpoint | Required effective permissions |
| --- | --- |
| GET /api/users | users.read |
| GET /api/users/{userId} | users.manage |
| POST /api/users | users.manage AND roles.assign |
| PATCH /api/users/{userId} | users.manage |
| DELETE /api/users/{userId} | users.manage |
| PUT /api/users/{userId}/roles | roles.assign |
| GET /api/roles | roles.read |
| GET /api/permissions | permissions.read |
| PUT /api/roles/{roleId}/permissions | role-permissions.manage |
| GET /api/hiring-levels | hiring-levels.read |
| POST/PATCH/DELETE /api/hiring-levels[/id] | hiring-levels.manage |
| GET /api/departments | users.manage |

Grants are checked by HTTP handlers and again by queries/services. Authentication reloads current database status/grants. Temporary `test:admin` fixtures confer no business access. Admin scope is university-wide. Mutations require an exact same Origin, reject cross-site fetches, and use bounded JSON object bodies (256 KiB), except DELETE which requires no body. Responses are private/no-store, with structured errors and 201/200/204 success codes.

Users, roles and departments use UUID keyset pagination, default 20 / maximum 100. Users support q (case-insensitive name/email), roleId, boolean accountStatus, departmentId and hiringLevelId. Hiring levels and permissions return complete `{items}` catalogs. All user resources include boolean accountStatus, complete assigned role IDs and faculty profile or null; list resources also include role names. Department code/name both use the existing imported departmentName (CourseBook code); no new department catalog is invented. Permission key/name both use permissionName, with null description and a featureGroup from the key prefix.

AppUser and Role now have integer revisions starting at zero. HiringLevel adds active (existing/new levels default true) and revision. PATCH and assignment PUT require expectedRevision; stale writes return 409. User detail PATCH and role PUT remain separate transactions, using the advanced revision returned by PATCH. User creation/profile/roles are atomic. Role replacements and permission replacements are atomic. Transactions use Serializable isolation; serialization conflicts return 409 for explicit reload/retry. No automatic mutation retries are performed.

Creation requires name, email, explicit boolean accountStatus and at least one valid role. Optional faculty profiles require an existing department and active hiring level. PATCH preserves omitted profile values, roles, teaching and evaluation history; new profiles require both references. Existing inactive hiring-level assignments can be retained, but new assignments require an active level. Hire dates use validated YYYY-MM-DD. Null profile/date clearing is undefined and rejected. Unknown fields, duplicate/unknown role IDs and unsupported permission keys are rejected. Emails are trimmed and lowercased; uniqueness uses the existing database constraint.

Per the October 25 user correction, creation now provisions normalized firstname_lastname usernames and randomly salted scrypt hashes of initial password 123 atomically with profile/roles. Multi-part names use first/last words; single-word names use that word. Collisions append _2, _3, etc.; bases are capped at 90 characters for login compatibility. Concurrent creation conflicts return 409 for explicit retry. Existing seeded logins remain unchanged; existing null usernames are not backfilled. Name edits do not rename logins or reset passwords. Admin request/response formats remain unchanged and exclude credentials. Runtime authentication also uses Prisma Client. User DELETE is implemented by the follow-up documented above.

Direct role permissionKeys stay separate from effectivePermissionKeys. Admin dynamically inherits AC and Faculty grants; AC inherits Faculty grants. Both Admin API responses and existing database authentication use this hierarchy. Existing seeded flattened direct grants are preserved, so a directly assigned grant remains effective even if removed from a lower role. Custom roles inherit nothing. Changing grants does not rewrite other roles or assigned role IDs.

Conservative safeguards preserve active Admin access: block removing the caller's active Admin assignment/status or currently held management grants. Also block loss of the last active Admin with users.read, users.manage, roles.read, permissions.read, roles.assign and role-permissions.manage. These checks run inside the same Serializable transaction and roll back rejected changes. Hiring-level deletion is physical only when the existing faculty foreign key permits it; in-use levels return 409, without reassignment, cascading deletion or automatic archival. Positive whole evaluation intervals use the PostgreSQL integer range (1..2147483647); seeded rank frequencies remain 1/2/2 years. Changes do not recalculate historical evaluations; future eligibility services must read current levels.

## Validation

- `node --test tests/unit/*.test.mjs`: includes HTTP authorization for all 13 operations, same-origin enforcement, validation, filters, revision rejection, inheritance and admin access guards.
- `npx tsc --noEmit --incremental false` and `npm run lint`.
- `node --env-file-if-exists=.env tests/integration/admin-backend.mjs`: requires a running local PostgreSQL. Applies every committed migration in a unique temporary schema, tests persisted CRUD, pagination/filtering, stale/concurrent updates, rollback, inheritance, retention and admin safeguards, then removes only that schema. Never changes application records.

During implementation, the full 119-test unit suite and the expanded 10-test Admin suite passed (120 tests total); TypeScript, lint and the production build passed on retry. Database integration could not run: PostgreSQL at 127.0.0.1:5432 refused the connection. Application migrations have not been deployed. Start PostgreSQL explicitly, deploy migrations, and run the database integration check before relying on live persistence.

The initial production build stopped for a Next.js 16.4.0 security advisory. Retrying completed successfully with the advisory still present. Upgrade Next.js to a patched release as separate dependency work; no dependencies were changed in this task.
