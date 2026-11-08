# Shared layout components

## Account dropdown

The application shell supplies `AccountDropdown` to PageHeader's optional `accountControl` slot when a signed-in header user has no explicit custom action. It reuses Avatar and Button and shows the user's name plus Log out. The shell calls Auth.js `signOut({ redirectTo: "/login" })`; pages do not implement their own account menu. The dropdown supports outside-click/Escape dismissal, keyboard focus, pending state, and logout errors. Explicit `user.action` behavior remains available for other header uses.

## Application shell

`src/app/(main)/layout.tsx` now renders `AppShell`, composing the sidebar on the left and the page header above centered main content. Small screens have a navigation toggle. Pages supply only their content.

The shared server layout requires login and filters navigation by effective permissions. Faculty includes Dashboard, My Evaluation, Observer Requests, Observations, and History. Admin adds Component Tests and Authentication Tests. Dashboard and observation route layouts enforce Faculty read permissions; test pages separately require `test:admin`. The shell receives the signed-in user name and roles for the sidebar and account dropdown. Faculty screens remain previews/empty states; this integration does not populate business records. Header controls and Faculty spacing are preserved.

## Navigation animation and accessibility review (#92, November 6, 2026)

- Sidebar groups expand/collapse in 200 ms with rotating chevrons. Collapsed links are inert and hidden from assistive technology. The scrollable navigation keeps the account footer stationary.
- The shell adds a keyboard-visible skip link, mobile-menu Escape/return focus, and a minimum mobile-menu height for short enlarged views. Shared field borders have stronger contrast. KPI skeletons have one live loading message, decorative placeholders, and a reduced-motion override.
- User-requested visual additions beyond the issue: compact sidebar branding/spacing, subtle grain, and a muted glass selection with a white edge line. The glass and line move together in a 340 ms interruptible animation. Reduced motion skips it. No animation dependency was added.

Verification: TypeScript, changed-component ESLint, and 21 navigation/resource/hiring-level tests passed. A local isolated check of the actual selection callback confirmed one animation normally and zero with reduced motion. Browser checks covered group keyboard operation, skip-link activation, fixed footer, mobile Escape, account-menu focus, observer-review dialog confinement/return focus, and hiring-level required-field errors. Responsive checks reached 320 x 255 CSS pixels without page-level overflow on My Evaluation. The user verified navigation at 200%/400% zoom, basic Narrator/Tab operation, and Windows Animation effects disabled.

Axe-core 4.14.0 checks covered representative login, Faculty, AC and Admin screens; some runs covered loading/empty states. Loaded reports, observer selection and hiring levels were checked separately. Temporary audit/profiling code was removed; local evidence remains ignored under `.local/`. These checks do not establish exhaustive WCAG 2.2 AA compliance or cover every success/error path.

Remaining findings: Faculty History has six header contrast failures (4.47:1 versus 4.5:1) and an incomplete ARIA check; its code was not changed. Some routes announce a generic page title. Coordinate large-table scrolling/pagination findings with #86. Notification/email behavior was not modified. A broader existing cycle-selection unit test still fails in unchanged ObservationProgressPage because its React stub omits useEffect; the same failure was reproduced using the main version. Auth/loading performance changes are deferred until after team merges.

Mobile menu polish: Show/Hide navigation now uses a 220ms height transition with a short fade, disabled by prefers-reduced-motion. Closed mobile navigation becomes inert/aria-hidden immediately while its visual exit finishes; desktop navigation remains accessible regardless of mobile state. Browser checks verified closed/open heights, Escape/return focus, selection alignment after reopening and desktop access after resizing.

The mobile menu now overlays the page rather than moving its content. Escape, keyboard focus leaving the menu, or a pointer action outside it dismisses the disclosure. Browser verification confirmed that the page heading stayed at the same Y position (76px) with the menu closed/open, and Tab-out/Escape correctly dismissed it.
