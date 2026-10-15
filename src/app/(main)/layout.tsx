import type { ReactNode } from "react";

export default function MainLayout({ children }: { children: ReactNode }) {
  // TODO(auth): Once src/auth.ts exists, check auth() here and redirect
  // unauthenticated users to /login. This layout is not protected yet.
  // Restricted pages, server queries, and API handlers must also enforce current
  // permissions and record ownership; a layout check alone is insufficient.

  // TODO(user): Load the current user's profile and effective permissions here
  // through a shared server query, then pass safe fields to the future app shell.
  // If using a client-side user provider instead, fetch GET /api/me there and
  // share its result. Individual pages do not need to repeat that fetch.

  return (
    <div className="flex flex-1">
      {/* TODO(sidebar): Add the Figma left sidebar: branding, permission-based
          Faculty / Assessment Committee / Admin links, and user info at the bottom.
          Server access checks still enforce access independently of visible links. */}
      <div className="min-w-0 flex-1 p-ah-24 md:p-ah-32">
        {/* Center the shared header and content within the area beside the sidebar. */}
        <div className="mx-auto w-full max-w-[1096px]">
        {/* Task 1 handoff: replace this reserved row with Layout/Page Header
            (Figma 3:126). It is shared by all Faculty / AC / Admin pages:
            page title + optional subtitle on the left, notifications + profile
            on the right. Keep it in normal flow above page content.
            Supply page-specific title/subtitle when wiring the shared component;
            do not add a second header inside each page.
            TODO(account): Connect profile controls to Auth.js logout. */}
        <div
          data-slot="page-header"
          aria-hidden="true"
          className="min-h-[80px] w-full mb-ah-24"
        />
        <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
