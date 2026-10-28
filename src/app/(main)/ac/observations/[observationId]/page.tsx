import { ObservationDetails } from "./observation-details";
import { requireAcPage } from "@/server/ac-access";

export default async function ObservationDetailsPage({ params, searchParams }: { params: Promise<{ observationId: string }>; searchParams?: Promise<{alertId?:string}> }) {
  const user = await requireAcPage("ac.detail");
  const { observationId } = await params;
  const query = searchParams ? await searchParams : {};
  return <ObservationDetails alertId={query.alertId} observationId={observationId} canReadAssessment={user.permissions.includes("assessments.read")} />;
}
