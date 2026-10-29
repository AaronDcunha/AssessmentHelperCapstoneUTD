import ObserverSelectionScreen from "./observer-selection-screen";
import { requireAcPage } from "@/server/ac-access";

export default async function ObserverSelectionPage() {
  const user = await requireAcPage("ac.observerSelection");
  return <ObserverSelectionScreen
    canGenerate={user.permissions.includes("recommendations.generate")}
    canRelease={user.permissions.includes("recommendations.release")}
    canRegenerate={user.permissions.includes("recommendations.regenerate")}
  />;
}
