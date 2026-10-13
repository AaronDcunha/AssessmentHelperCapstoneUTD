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
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-5xl">
          <p className="text-lg font-semibold">Assessment Helper</p>
          {/* TODO(nav): Insert the shared navbar here, using effective permissions
              to show available links. Server access checks still enforce access. */}
          {/* TODO(account): Add the current user's name and an Auth.js logout action. */}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        {children}
      </main>
    </div>
  );
}
