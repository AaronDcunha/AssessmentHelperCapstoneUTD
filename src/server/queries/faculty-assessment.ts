import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import type { AccountUser } from "../account-auth";
import { getPrisma } from "../prisma";
import { selectedFacultyObservation } from "../faculty-context";
import { getFacultyDashboard } from "./faculty-dashboard";
import { commentPrompts, signatureLabels } from "../configuration-validation";
import { readTemplateSnapshot } from "../template-snapshot";

type Database = Prisma.TransactionClient;
export type Criterion = { id: string; prompt: string; type: string; min: number | null; max: number | null; required: boolean; options: { value: number; label: string }[] | null };
export type CommentPrompt = { id: string; prompt: string; required: boolean; order: number };
export type AssessmentAnswers = { answers: Record<string, string | number>; comments: string; promptAnswers?: Record<string, string> };
export type FacultyAssessment = {
  observationId: string; templateId: string; title: string; description: string | null;
  course: string; section: string; scheduledAt: string | null;
  participation: "observer" | "observee"; observer: string; observee: string;
  criteria: Criterion[]; responses: AssessmentAnswers; revision: string;
  templateRevision: number; commentPrompts: CommentPrompt[]; signatureLabels: { observer: string; observee: string }; timeZone: string;
  observerSignedAt: string | null; observeeSignedAt: string | null; locked: boolean;
  canEdit: boolean; canAcknowledge: boolean;
};
export type AssessmentRow = {
  observationId: string; templateId: string; title: string; description: string | null; course: string; section: string;
  scheduledAt: Date | null; participation: "observer" | "observee"; observer: string; observee: string;
  criteria: Criterion[]; responses: AssessmentAnswers | null; observerSignedAt: Date | null; observeeSignedAt: Date | null; locked: boolean;
  templateRevision: number; commentPrompts: CommentPrompt[]; signatureLabels: { observer: string; observee: string }; timeZone: string;
};

// jsonb does not preserve object insertion order. Revisions must describe the
// content, including ordered question/option arrays, rather than JSON key order.
function revisionContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revisionContent);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, revisionContent(item)]));
  }
  return value;
}

export function assessmentView(row: AssessmentRow, user: AccountUser): FacultyAssessment {
  const responses = row.responses ?? { answers: {}, comments: "" };
  if (!responses.answers || typeof responses.answers !== "object" || Array.isArray(responses.answers)
    || typeof responses.comments !== "string" || Object.values(responses.answers).some(value => typeof value !== "number" && typeof value !== "string")
    || Object.keys(responses).some(key => !["answers", "comments", "promptAnswers"].includes(key))
    || (responses.promptAnswers !== undefined && (!responses.promptAnswers || typeof responses.promptAnswers !== "object" || Array.isArray(responses.promptAnswers)
      || Object.values(responses.promptAnswers).some(value => typeof value !== "string")))) {
    // Preserve unrecognized existing JSON rather than overwriting it with an empty draft.
    throw new Error("The stored assessment answer format requires review.");
  }
  const observerSignedAt = row.observerSignedAt?.toISOString() ?? null, observeeSignedAt = row.observeeSignedAt?.toISOString() ?? null;
  commentPrompts(row.commentPrompts); signatureLabels(row.signatureLabels);
  const revision = createHash("sha256").update(JSON.stringify(revisionContent([row.observationId, row.templateId, row.templateRevision, row.criteria, row.commentPrompts, row.signatureLabels, responses, observerSignedAt, observeeSignedAt, row.locked]))).digest("hex");
  return { ...row, responses: row.participation === "observee" && !observerSignedAt ? { answers: {}, comments: "" } : responses, scheduledAt: row.scheduledAt?.toISOString() ?? null, observerSignedAt, observeeSignedAt, revision,
    canEdit: row.participation === "observer" && !row.locked && !observerSignedAt && !observeeSignedAt && user.permissions.includes("assessment.submit.own"),
    canAcknowledge: !row.locked && (row.participation === "observer" ? !observerSignedAt && user.permissions.includes("assessment.submit.own")
      : !!observerSignedAt && !observeeSignedAt && user.permissions.includes("assessment.acknowledge.own")) };
}

export async function getFacultyAssessment(user: AccountUser, options: { database?: Database } = {}): Promise<FacultyAssessment | null> {
  if (!["profile.read.own", "observations.read.own", "assessment.read.own"].every(grant => user.permissions.includes(grant))) return null;
  const db = options.database ?? getPrisma();
  const selectedId = await selectedFacultyObservation();
  const dashboard = selectedId ? null : await getFacultyDashboard(user, options);
  const observationId = selectedId ?? dashboard?.currentObservation?.id;
  if (!observationId) return null;
  const record = await db.observation.findFirst({ where: { observationId, OR: [{ signup: { professor: { userId: user.id } } }, { observer: { userId: user.id } }] }, include: { observer: { include: { user: true } }, signup: { include: { professor: { include: { user: true } }, section: { include: { course: true, semester: true } } } }, cycle: true, signedAssessment: true } });
  const now = new Date();
  if (!record?.observer || !record.scheduledAt || ["NOT_OCCURRED", "CANCELLED", "CANCELED"].includes(record.status.toUpperCase())) return null;
  const saved = record.signedAssessment;
  if (!saved && (record.cycle.observationDeadline <= now || record.completedAt || record.status.toUpperCase() === "COMPLETED")) return null;
  const snapshot = saved ? readTemplateSnapshot(saved.templateSnapshot) : null;
  const templateId = snapshot?.id ?? saved?.templateId ?? record.assignedTemplateId;
  // The fallback is only for a legacy row read during rolling deployment. New
  // observations always persist assignedTemplateId at creation/migration time.
  const template = snapshot ? null : templateId ? await db.observationTemplate.findUnique({ where: { templateId }, include: { criteria: { orderBy: [{ displayOrder: "asc" }, { criterionId: "asc" }] } } })
    : await db.observationTemplate.findFirst({ where: { isActive: true, status: "published", archivedAt: null }, orderBy: [{ publishedAt: "desc" }, { templateId: "desc" }], include: { criteria: { orderBy: [{ displayOrder: "asc" }, { criterionId: "asc" }] } } });
  // An observation pins its template at creation/reassignment time. Archiving
  // that template must not make the already-assigned form disappear, even when
  // the observer has not saved the first draft yet. Legacy rows without an
  // assignment still use the published-only fallback query above.
  if (!snapshot && !template) return null;
  const source = snapshot ?? { id: template!.templateId, title: template!.templateName, description: template!.description, revision: template!.revision,
    criteria: template!.criteria.map(c => ({ id: c.criterionId, prompt: c.criterionText, type: c.questionType, required: c.isRequired, options: c.options })),
    commentPrompts: template!.commentPrompts, signatureLabels: template!.signatureLabels };
  const section = record.signup.section;
  const view = assessmentView({ observationId: record.observationId, templateId: source.id, title: source.title, description: source.description, templateRevision: source.revision, commentPrompts: commentPrompts(source.commentPrompts) as CommentPrompt[], signatureLabels: signatureLabels(source.signatureLabels), timeZone: section.semester.timeZone, course: section.course.courseCode, section: section.sectionCode, scheduledAt: record.scheduledAt, participation: record.observer.userId === user.id ? "observer" : "observee", observer: record.observer.user.fullName, observee: record.signup.professor.user.fullName, locked: saved?.isLocked ?? false, responses: saved?.responses as AssessmentAnswers | null, observerSignedAt: saved?.observerSignedAt ?? null, observeeSignedAt: saved?.observeeSignedAt ?? null, criteria: source.criteria.map(criterion => ({ id: criterion.id, prompt: criterion.prompt, type: criterion.type, min: null, max: null, required: criterion.required, options: (criterion.options ?? null) as Criterion["options"] })) }, user);
  // Expired and completed records remain readable; writes still obey deadlines.
  if (record.cycle.observationDeadline <= now || record.completedAt || record.status.toUpperCase() === "COMPLETED") { view.canEdit = false; view.canAcknowledge = false; }
  return view;
}
