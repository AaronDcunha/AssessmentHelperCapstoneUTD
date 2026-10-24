import { CycleForm } from "@/components/ac/cycle-form";
import { requireAcPage } from "@/server/ac-access";

export default async function CreateCyclePage() {
  await requireAcPage("ac.cycleCreate");
  return <CycleForm mode="create" />;
}
