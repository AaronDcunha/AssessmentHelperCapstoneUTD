import Screen from "./progress-screen";
import { requireAcPage } from "@/server/ac-access";

export default async function Page() {
  await requireAcPage("ac.progress");
  return <Screen />;
}
