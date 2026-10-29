import { SignupScreen } from "@/components/observations/faculty-screens";
import { facultyPageData } from "@/server/queries/faculty-page-data";
import { redirect } from "next/navigation";
import { facultyRoutes } from "@/components/observations/faculty-routes";

export default async function Page() {
  const { data } = await facultyPageData();
  if (data?.existingSignup) redirect(facultyRoutes.details);
  return <SignupScreen data={data} />;
}

