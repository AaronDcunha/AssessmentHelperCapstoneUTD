import { requireAcPage } from "@/server/ac-access";
import { getSemesterFeedback } from "@/server/queries/semester-feedback";
import { TableCell } from "@/components/ui/table";
import { FeedbackDetails } from "./feedback-details";
import { FeedbackTable } from "./feedback-table";

const feedbackPageSizes = [10, 25, 50];

export default async function SemesterFeedbackPage({ searchParams }: {
  searchParams: Promise<{ semester?: string; page?: string; size?: string }>;
}) {
  await requireAcPage("ac.feedback");
  const params = await searchParams;
  const size = Number(params.size);
  const pageSize = feedbackPageSizes.includes(size) ? size : feedbackPageSizes[0];
  const requestedPage = Number(params.page);
  const result = await getSemesterFeedback(params.semester, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, pageSize);
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: result.selected?.timeZone });
  return <FeedbackTable semesters={result.semesters.map(({ id, name }) => ({ id, name }))}
    semesterId={result.selected?.id ?? ""} page={result.page} pageSize={pageSize} pageSizes={feedbackPageSizes} total={result.total} rowsShown={result.rows.length}>
    {result.rows.map(row => {
      const section = row.observation.signup.section;
      const faculty = row.professor.user.fullName;
      const role = row.feedbackRole === "OBSERVEE" ? "Observee" : "Observer";
      const course = section.course.courseCode + "." + section.sectionCode;
      const submitted = date.format(row.submittedAt);
      const satisfaction = row.satisfaction == null ? "—" : row.satisfaction + " / 5";
      return <tr key={row.feedbackId} className="border-t border-border">
        <TableCell>{faculty}<p className="text-caption text-muted">{role}</p></TableCell>
        <TableCell>{course}</TableCell>
        <TableCell><time dateTime={row.submittedAt.toISOString()}>{submitted}</time></TableCell>
        <TableCell>{satisfaction}</TableCell>
        <TableCell><FeedbackDetails faculty={faculty} role={role} course={course} submitted={submitted} satisfaction={satisfaction}
          difficulties={row.difficulties} suggestions={row.suggestions} /></TableCell>
      </tr>;
    })}
  </FeedbackTable>;
}
