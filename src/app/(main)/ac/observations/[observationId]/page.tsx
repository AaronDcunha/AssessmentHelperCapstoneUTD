import { ObservationDetails } from "./observation-details";
import { requireAcPage } from "@/server/ac-access";

export default async function ObservationDetailsPage({ params }: { params: Promise<{ observationId: string }> }) {
  const user = await requireAcPage("ac.detail");
  const { observationId } = await params;
  return <ObservationDetails observationId={observationId} canReadAssessment={user.permissions.includes("assessments.read")} />;
}
