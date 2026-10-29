import { FacultyCandidates } from "@/components/observations/faculty-candidates";
import { facultyPageData } from "@/server/queries/faculty-page-data";

export default async function Page() { const { data } = await facultyPageData(); return <FacultyCandidates data={data} />; }

