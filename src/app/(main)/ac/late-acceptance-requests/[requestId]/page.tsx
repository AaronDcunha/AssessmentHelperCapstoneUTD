import { requireAcPage } from "@/server/ac-access";
import { LateAcceptanceScreen } from "@/components/ac/late-acceptance-screen";
export default async function LateAcceptanceReviewPage({ params }: { params: Promise<{ requestId: string }> }) {
  await requireAcPage("ac.lateAcceptance");
  const { requestId } = await params;
  return <LateAcceptanceScreen requestId={requestId} />;
}
