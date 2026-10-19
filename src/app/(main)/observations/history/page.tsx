import type { Metadata } from "next";
import { ConnectedObservationHistory } from "@/components/observations/connected-observation-history";
import { requirePermission } from "@/server/permissions";

export const metadata: Metadata = { title: "Observation History | Assessment Helper" };
export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  // Match the business grant used by the shared observations layout and API.
  await requirePermission("observations.read.own");
  if (process.env.NODE_ENV !== "development") {
    return (
      <section className="p-ah-32">
        <h1 className="text-title">Observation History</h1>
        <p role="alert" className="mt-ah-16 text-body text-muted">
          Observation history is currently unavailable. Please try again later.
        </p>
      </section>
    );
  }

  const { state } = await searchParams;
  const stateOverride =
    state === "loading" || state === "error" || state === "denied" || state === "empty"
      ? state
      : undefined;
  return <ConnectedObservationHistory stateOverride={stateOverride} />;
}
