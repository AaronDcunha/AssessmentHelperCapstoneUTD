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
  const { state } = await searchParams;
  const stateOverride =
    process.env.NODE_ENV === "development" && (state === "loading" || state === "error" || state === "denied" || state === "empty")
      ? state
      : undefined;
  return <ConnectedObservationHistory stateOverride={stateOverride} />;
}
