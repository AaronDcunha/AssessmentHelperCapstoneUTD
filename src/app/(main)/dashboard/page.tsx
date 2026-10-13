import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Welcome | Assessment Helper",
};

// TODO(login): Use redirectTo: "/dashboard" as the temporary login destination.
// Authentication is not implemented yet; visiting this route does not prove login.
export default function DashboardPage() {
  // TODO(access): Add any dashboard-specific server permission checks when its
  // functionality is implemented. Do not rely on navbar visibility for access.
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-12">
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Assessment Helper
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Welcome to Assessment Helper
      </h1>
      <p className="mt-4 max-w-xl leading-7 text-zinc-600 dark:text-zinc-300">
        Your dashboard is coming soon. This page will be your starting point for
        evaluations and observation activities.
      </p>
      {/* TODO(dashboard): Replace this temporary content with the faculty dashboard. */}
    </section>
  );
}
