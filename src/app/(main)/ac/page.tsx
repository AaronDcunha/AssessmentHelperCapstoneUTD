import Screen from "./dashboard-screen";
import { requireAcPage } from "@/server/ac-access";

export default async function Page() {
  await requireAcPage("ac.dashboard");
  return <Screen />;
}
