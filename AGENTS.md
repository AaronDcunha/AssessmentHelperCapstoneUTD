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

### UI colors and shared layout

- Use the Assessment Helper Figma palette defined in `src/app/globals.css`. Prefer semantic Tailwind classes over hardcoded hex values, generic zinc/gray colors, or automatic dark-mode overrides. The current design uses the Figma light theme.
- Color usage: `bg-canvas` (page background), `bg-surface` (cards/forms), `bg-sidebar` (sidebar and primary actions), `bg-active` (active/hover navigation), `text-ink` (main text), `text-muted` (secondary text), `text-light` (text on green surfaces), `border-border` (dividers/outlines), and `bg-accent` (orange highlights).
- Status colors: `text-danger` with `bg-danger-bg`, `text-warning` with `bg-warning-bg`, and `bg-neutral-bg` for neutral status surfaces. `bg-background` and `text-foreground` alias canvas and ink. The correct class is `text-muted`, not `text0muted`.
- These tokens support the appropriate Tailwind color utilities (for example, `border-accent`, `ring-sidebar`, and `hover:bg-active`). Pick tokens by purpose and preserve readable contrast.
- Keep shared sidebar/account controls in `src/app/(main)/layout.tsx` or shared layout components; individual pages supply the main content. Navigation visibility uses effective permissions, while server checks independently enforce access.
- Global typography uses Inter through `next/font`, with Arial/Helvetica/sans-serif fallbacks. Use `text-title` (36/50px, 700), `text-section` and `text-brand` (24/34px, 600), `text-body` (16/22px, 400), `text-label` (14/20px, 500), `text-caption` (12/17px, 400), and `text-metric` (48/67px, 600). Each class includes line height, weight, and zero tracking; use semantic HTML headings independently of the visual style.
- Use Figma spacing tokens via `p-ah-24`, `gap-ah-16`, `mt-ah-8`, etc. Supported pixel values: 0, 4, 8, 12, 16, 24, 32, 40, 48, 64 (stored as rem at a 16px root). Tailwind's ordinary `p-4` means 16px, not Figma's 4px; the `ah-` names make this explicit.
- Use `rounded-ah-0`, `rounded-ah-8`, `rounded-ah-12`, or `rounded-ah-pill` for the Figma radii. Existing shared control sizes are available as `h-control-56` and `h-control-88`; apply them only to components that use those sizes in Figma.
- Global defaults include the light color scheme, body text style, and a visible keyboard focus outline. Preserve focus visibility; add a contrasting focus treatment for controls on green surfaces. Figma currently defines no shared shadow/effect styles, so do not invent a global shadow system. Breakpoints and component-specific sizing remain implementation decisions, not established Figma tokens.

- Follow the responsibility map in `docs/reference/PROJECT_STRUCTURE.md`; keep shared business rules in server services and authorized reads in server queries.
- Enforce permissions, record ownership, and deadline checks on the server, including direct API requests. UI visibility is not authorization.
- Preserve template versions, form-answer history where required, invitation attempts, and approval records. Use transactions for observer selection and related state changes.
- Keep private attachments and secrets out of `public/` and source control. Do not expose credentials in logs or output.
- Inspect available dependencies before importing a library. Zod and test frameworks are currently deferred; adding them is a deliberate implementation change.
- Use meaningful validation/tests for changed business rules and access controls. Run relevant available checks; report what passed and any checks that could not run.
- Preserve teammates' unrelated changes. Avoid destructive database resets, deleting volumes, or rewriting migrations that others may have applied.
- When a requirement changes, update the implementation notes and affected docs together. Report what changed, how it was checked, and remaining limitations.
