import Screen from "./faculty-screen";
import { requireAcPage } from "@/server/ac-access";

export default async function Page() {
  await requireAcPage("ac.faculty");
  return <Screen />;
}
