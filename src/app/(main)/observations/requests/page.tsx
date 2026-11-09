import { RequestsScreen } from "@/components/observations/faculty-screens";
import { facultyRequestsPageData } from "@/server/queries/faculty-page-data";

export default async function Page() { const data = await facultyRequestsPageData(); return <RequestsScreen data={data} />; }

