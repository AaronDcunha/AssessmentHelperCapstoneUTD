import Screen from "./reports-screen";
import { requireAcPage } from "@/server/ac-access";

export default async function Page() {
  await requireAcPage("ac.reports");
  return <Screen />;
}
