# Shared layout components

## Account dropdown

The application shell supplies `AccountDropdown` to PageHeader's optional `accountControl` slot when a signed-in header user has no explicit custom action. It reuses Avatar and Button and shows the user's name plus Log out. The shell calls Auth.js `signOut({ redirectTo: "/login" })`; pages do not implement their own account menu. The dropdown supports outside-click/Escape dismissal, keyboard focus, pending state, and logout errors. Explicit `user.action` behavior remains available for other header uses.

## Application shell

`src/app/(main)/layout.tsx` now renders `AppShell`, composing the sidebar on the left and the page header above centered main content. Small screens have a navigation toggle. Pages supply only their content.

The shared server layout requires login and filters navigation by effective permissions. Faculty includes Dashboard, My Evaluation, Observer Requests, Observations, and History. Admin adds Component Tests and Authentication Tests. Dashboard and observation route layouts enforce Faculty read permissions; test pages separately require `test:admin`. The shell receives the signed-in user name and roles for the sidebar and account dropdown. Faculty screens remain previews/empty states; this integration does not populate business records. Header controls and Faculty spacing are preserved.
