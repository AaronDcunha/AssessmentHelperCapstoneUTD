import { CycleForm } from "@/components/ac/cycle-form";

export default async function EditCyclePage({ params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;
  return <CycleForm mode="edit" cycleId={cycleId} />;
}
