import Screen from "./semester-screen";
import { requireAcPage } from "@/server/ac-access";

export default async function Page() {
  await requireAcPage("ac.semester");
  return <Screen />;
}
