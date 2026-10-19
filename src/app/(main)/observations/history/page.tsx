import { FacultyHistoryScreen } from "@/components/observations/history-screen";

export default function HistoryPage() {
  // No history query exists in this checkout. Do not invent records or fetch
  // unscoped faculty data. Future records must come from an authorized server read.
  return <FacultyHistoryScreen records={[]} />;
}
