import { notFound } from "next/navigation";
import { ObservationDetailsScreen } from "@/components/observations/faculty-screens";
import { ObservationDetails } from "@/components/observations/observation-details";
import { facultyRoutes } from "@/components/observations/faculty-routes";
import { facultyPageData } from "@/server/queries/faculty-page-data";
import { requirePermission } from "@/server/permissions";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ observationId?: string | string[] }>;
}) {
  const { observationId } = await searchParams;
  const user = await requirePermission("observations.read.own");
  if (observationId !== undefined) {
    if (typeof observationId !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(observationId)) notFound();
    return <ObservationDetails observationId={observationId}
      canReadAssessment={user.permissions.includes("assessment.read.own")}
      backHref={facultyRoutes.history} backLabel="Back to History" />;
  }
  const { data } = await facultyPageData();
  return <ObservationDetailsScreen data={data} canReadAssessment={user.permissions.includes("assessment.read.own")} />;
}
