import { AppointmentScreen } from "@/components/observations/faculty-screens";
import { facultyPageData } from "@/server/queries/faculty-page-data";

export default async function Page() { const { data } = await facultyPageData(); return <AppointmentScreen data={data} />; }
