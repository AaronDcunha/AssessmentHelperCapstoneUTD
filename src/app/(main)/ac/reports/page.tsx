import Screen from "./reports-screen";
import { requireAcPage } from "@/server/ac-access";

export const metadata = { title: "Reports and KPIs" };

export default async function Page() {
  await requireAcPage("ac.reports");
  return <Screen />;
}
