import { requireAcPage } from "@/server/ac-access";
import { LateAcceptanceScreen } from "@/components/ac/late-acceptance-screen";
export default async function LateAcceptancePage() {
  await requireAcPage("ac.lateAcceptance");
  return <LateAcceptanceScreen />;
}
