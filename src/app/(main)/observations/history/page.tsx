import type { Metadata } from "next";
import { ConnectedObservationHistory } from "@/components/observations/connected-observation-history";
import { currentSemester } from "@/lib/observer-selection";
import { getPrisma } from "@/server/prisma";
import { requirePermission } from "@/server/permissions";

export const metadata: Metadata = { title: "Observation History | Assessment Helper" };
export const dynamic = "force-dynamic";

async function getCurrentHistorySemester() {
  const semesters = await getPrisma().semester.findMany({
    select: { termName: true, startsOn: true, endsOn: true, timeZone: true },
  });
  return currentSemester(semesters, semester => ({
    startsOn: semester.startsOn?.toISOString().slice(0, 10),
    endsOn: semester.endsOn?.toISOString().slice(0, 10),
    timeZone: semester.timeZone,
  }), Date.now());
}

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
  const current = await getCurrentHistorySemester();
  return <ConnectedObservationHistory stateOverride={stateOverride} defaultSemester={current?.termName} />;
}
