import { redirect } from "next/navigation";
import { facultyRoutes } from "@/components/observations/faculty-routes";

/** Preserve existing local bookmarks; the shared sidebar uses the canonical route. */
export default function LegacyHistoryPage() {
  redirect(facultyRoutes.history);
}
