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
      <div className="min-w-0 flex-1">
        {/* TODO(header): Add shared notification and profile controls here.
            Page-specific titles belong with the page's content. */}
        {/* TODO(account): Connect the user controls to an Auth.js logout action. */}
        <main>{children}</main>
      </div>
    </div>
  );
}
