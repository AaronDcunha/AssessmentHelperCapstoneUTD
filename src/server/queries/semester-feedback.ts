import "server-only";
import { currentSemester } from "@/lib/observer-selection";
import { getPrisma } from "../prisma";

export function getSemesterFeedback(semesterId: string | undefined, requestedPage: number, pageSize: number) {
  return getPrisma().$transaction(async db => {
    const semesters = (await db.semester.findMany({
      select: { semesterId: true, termName: true, termCode: true, startsOn: true, endsOn: true, timeZone: true },
    })).map(semester => ({
      id: semester.semesterId,
      name: semester.termName,
      termCode: semester.termCode,
      startsOn: semester.startsOn?.toISOString().slice(0, 10),
      endsOn: semester.endsOn?.toISOString().slice(0, 10),
      timeZone: semester.timeZone,
    }));
    const termOrder = (code: string) => Number(code.slice(0, 2)) * 3 + ["s", "u", "f"].indexOf(code[2]);
    semesters.sort((a, b) => termOrder(b.termCode) - termOrder(a.termCode) || a.name.localeCompare(b.name));
    const selected = semesterId === undefined
      ? currentSemester(semesters, semester => semester, Date.now())
      : semesters.find(semester => semester.id === semesterId);
    if (!selected) return { semesters, selected: null, rows: [], total: 0, page: 1 };

    const where = { observation: { cycle: { semesterId: selected.id } } };
    const total = await db.processFeedback.count({ where });
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await db.processFeedback.findMany({
      where,
      orderBy: [{ submittedAt: "desc" }, { feedbackId: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        feedbackId: true, feedbackRole: true, satisfaction: true, difficulties: true, suggestions: true, submittedAt: true,
        professor: { select: { user: { select: { fullName: true } } } },
        observation: { select: { signup: { select: { section: { select: {
          sectionCode: true, course: { select: { courseCode: true } },
        } } } } } },
      },
    });
    return { semesters, selected, rows, total, page };
  }, { isolationLevel: "RepeatableRead" });
}
