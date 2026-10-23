import { ObservationDetails } from "./observation-details";

export default async function ObservationDetailsPage({ params }: { params: Promise<{ observationId: string }> }) {
  const { observationId } = await params;
  return <ObservationDetails observationId={observationId} />;
}
