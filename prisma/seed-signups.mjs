import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { getPrisma } from '../src/server/prisma.ts';
import { facultyEligibility } from '../src/server/services/faculty-evaluation.ts';
import { facultyDate, proposedMeetingOptions } from '../src/server/services/faculty-calendar.ts';
import { meetingOccurrence } from '../src/server/services/faculty-meetings.ts';
import { stableId } from './seed-data.mjs';

// The same ten existing demo professors on every teammate's database.
export const demoSignupNames = ['Gale Aster', 'Robin Wren', 'Quartz Prairie', 'Cove Yew', 'Zenith Reese', 'Fern Journey', 'Finley Timber', 'Delta True', 'Grove Haven', 'Violet Lux'];

export async function seedSignups(prisma, { dryRun = false, now = new Date(), cycleId } = {}) {
  return prisma.$transaction(async db => {
    const cycles = await db.evaluationCycle.findMany({ where: cycleId ? { cycleId } : {}, include: { semester: true } });
    const applicable = cycles.filter(c => cycleId || (c.semester.startsOn && c.semester.endsOn
      && c.semester.startsOn.toISOString().slice(0, 10) <= facultyDate(now, c.semester.timeZone)
      && facultyDate(now, c.semester.timeZone) <= c.semester.endsOn.toISOString().slice(0, 10)));
    assert.equal(applicable.length, 1, 'A single current semester with a cycle is required; configure dates or pass --cycle-id=UUID.');
    const cycle = applicable[0], semester = cycle.semester;
    assert.ok(semester.startsOn && semester.endsOn && cycle.observationDeadline > now, 'Configure semester dates and a future observation deadline before seeding.');
    const calendar = { startsOn: semester.startsOn.toISOString().slice(0, 10), endsOn: semester.endsOn.toISOString().slice(0, 10), timeZone: semester.timeZone, termCode: semester.termCode };
    const rows = [];
    for (const name of demoSignupNames) {
      const username = name.toLowerCase().replaceAll(' ', '_');
      const professorId = stableId(`professor:${username}`);
      const professor = await db.professor.findUniqueOrThrow({ where: { professorId }, include: {
        user: true, hiringLevel: true, teaches: { include: { section: { include: { semester: true, course: true, classMeetings: true } } } },
      } });
      assert.equal(professor.user.fullName, name, 'Demo professor identity mismatch; run the basic seed first.');
      const existing = await db.evaluationSignup.findUnique({ where: { cycleId_professorId: { cycleId: cycle.cycleId, professorId } } });
      if (existing) { rows.push({ name, action: 'preserved existing signup', signupId: existing.signupId }); continue; }
      assert.ok(professor.user.isActive, `${name} is inactive.`);
      const completions = await db.observation.findMany({ where: { signup: { professorId }, signedAssessment: { is: { isLocked: true, observerSignedAt: { not: null }, observeeSignedAt: { not: null } } } }, include: { signedAssessment: true, cycle: { include: { semester: true } } } });
      const completionTime = o => o.signedAssessment.completedAt ?? o.completedAt ?? new Date(Math.max(o.signedAssessment.observerSignedAt.getTime(), o.signedAssessment.observeeSignedAt.getTime()));
      completions.sort((a, b) => completionTime(b) - completionTime(a) || a.observationId.localeCompare(b.observationId));
      const eligibility = facultyEligibility(calendar, completions[0]?.cycle.semester.termCode ?? null, professor.hiringLevel.evaluationIntervalYears, professor.hireDate, professor.teaches.map(t => t.section.semester.termCode));
      assert.ok(eligibility.canSignUp, `${name}: ${eligibility.reason}`);
      const sections = professor.teaches.map(t => t.section).filter(s => s.semesterId === cycle.semesterId)
        .sort((a, b) => a.course.courseCode.localeCompare(b.course.courseCode) || a.sectionCode.localeCompare(b.sectionCode) || a.sectionId.localeCompare(b.sectionId));
      const choices = sections.map(section => ({ section, meetings: section.classMeetings.map(m => ({ id: m.meetingId, day: m.dayOfWeek, startTime: m.startTime, endTime: m.endTime, location: m.location })) }))
        .map(item => ({ ...item, options: proposedMeetingOptions(item.meetings, now, cycle.observationDeadline, calendar) }));
      const choice = choices.find(c => c.options.filter(o => meetingOccurrence(o.date, c.meetings, semester.timeZone)).length >= 3);
      assert.ok(choice, `${name} needs an assigned course with three valid future meetings.`);
      const dates = choice.options.filter(o => meetingOccurrence(o.date, choice.meetings, semester.timeZone)).slice(0, 3).map(o => o.date);
      const signupId = stableId(`signup-demo-v1:${cycle.cycleId}:${professorId}`), observationId = stableId(`signup-demo-observation-v1:${cycle.cycleId}:${professorId}`);
      if (!dryRun) {
        await db.evaluationSignup.create({ data: { signupId, cycleId: cycle.cycleId, professorId, sectionId: choice.section.sectionId, signupDate: now } });
        await db.observation.create({ data: { observationId, signupId, cycleId: cycle.cycleId, status: 'PENDING' } });
        for (const date of dates) await db.observationTimeOption.create({ data: { observationId, preferredDate: new Date(`${date}T00:00:00Z`), ...meetingOccurrence(date, choice.meetings, semester.timeZone) } });
      }
      rows.push({ name, action: dryRun ? 'would create' : 'created', signupId, observationId, course: `${choice.section.course.courseCode}.${choice.section.sectionCode}`, dates });
    }
    return { dryRun, semester: semester.termName, signupDeadlinePassed: cycle.signupDeadline <= now, rows };
  }, { isolationLevel: 'Serializable', timeout: 60000 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let prisma;
  try {
    assert.notEqual(process.env.NODE_ENV, 'production', 'Demo signup seeding is disabled in production.');
    const url = new URL(process.env.DATABASE_URL);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Demo signup seeding requires local PostgreSQL.');
    const args = process.argv.slice(2);
    assert.ok(args.every(a => a === '--dry-run' || /^--cycle-id=[a-f\d-]{36}$/i.test(a)), 'Usage: npm run db:seed:signups -- [--dry-run] [--cycle-id=UUID]');
    prisma = getPrisma();
    const result = await seedSignups(prisma, { dryRun: args.includes('--dry-run'), cycleId: args.find(a => a.startsWith('--cycle-id='))?.split('=')[1] });
    console.log(JSON.stringify(result, null, 2));
    if (result.signupDeadlinePassed) console.log('Demo fixtures bypass the signup cutoff; normal signup rules and deadlines are unchanged.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await prisma?.$disconnect(); }
}
