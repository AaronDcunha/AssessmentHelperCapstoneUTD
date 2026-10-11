<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Assessment Helper AI development instructions

## Start here

Before implementing or reviewing a feature, read:

1. `docs/reference/README.md`
2. `docs/reference/Implementation_Notes.txt`
3. `docs/reference/PROJECT_STRUCTURE.md`
4. The relevant use cases, endpoint draft, and schema in that folder.

Read the actual source and `package.json` before deciding what is implemented. Many directories currently contain only placeholders. Do not describe planned features as working features.

## Requirement handling

Current user/team instructions override the stored references. The implementation notes override conflicting original documents. Assessments are web-based forms; do not implement signed assessment uploads. Automatic invitation resend and AC approval for expired invitations are required work. Manual observer replacement is a stretch goal. Evaluation frequency is annual for assistant professors and every two years for associate/full professors; faculty due in a semester must sign up by its cycle signup deadline.

Do not silently invent KPI formulas, invitation retry limits, acknowledgement rules, or eligibility edge-case policies. Check the notes, identify what is unresolved for the assigned feature, and ask a focused question when a decision is necessary. Continue independent work that does not depend on that decision. Keep stretch goals out of core implementation unless requested.

## Implementation practice

- Follow the responsibility map in `docs/reference/PROJECT_STRUCTURE.md`; keep shared business rules in server services and authorized reads in server queries.
- Enforce permissions, record ownership, and deadline checks on the server, including direct API requests. UI visibility is not authorization.
- Preserve template versions, form-answer history where required, invitation attempts, and approval records. Use transactions for observer selection and related state changes.
- Keep private attachments and secrets out of `public/` and source control. Do not expose credentials in logs or output.
- Inspect available dependencies before importing a library. Zod and test frameworks are currently deferred; adding them is a deliberate implementation change.
- Use meaningful validation/tests for changed business rules and access controls. Run relevant available checks; report what passed and any checks that could not run.
- Preserve teammates' unrelated changes. Avoid destructive database resets, deleting volumes, or rewriting migrations that others may have applied.
- When a requirement changes, update the implementation notes and affected docs together. Report what changed, how it was checked, and remaining limitations.
