import { CycleForm } from "@/components/ac/cycle-form";
import { requireAcPage } from "@/server/ac-access";

export default async function EditCyclePage({ params }: { params: Promise<{ cycleId: string }> }) {
  await requireAcPage("ac.cycleEdit");
  const { cycleId } = await params;
  return <CycleForm mode="edit" cycleId={cycleId} />;
}
