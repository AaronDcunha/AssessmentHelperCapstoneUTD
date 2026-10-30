import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, sep } from "node:path";
import type { AccountUser } from "../account-auth";
import { getPrisma } from "../prisma";
import { FacultyActionError } from "./faculty-actions";
import { facultyTransaction, requireFacultyGrants, touchObservation, workflowId, workflowObservation } from "./faculty-invitations";

const maxBytes = 5 * 1024 * 1024;
function storagePath(key: string) {
  workflowId(key);
  const root = resolve(/* turbopackIgnore: true */ process.env.FACULTY_ATTACHMENT_DIR ?? ".local/private-faculty-attachments");
  const fromPublic = relative(resolve("public"), root);
  if (!fromPublic || (!fromPublic.startsWith(`..${sep}`) && !isAbsolute(fromPublic))) throw new FacultyActionError("Supporting storage must be outside public assets.", 503);
  return resolve(root, key);
}
export async function uploadFacultyAttachment(user: AccountUser, observationId: string, file: { name: string; type: string; bytes: Uint8Array }) {
  requireFacultyGrants(user, "profile.read.own", "feedback.submit.own"); workflowId(observationId);
  const bytes = Buffer.from(file.bytes);
  const actualType = bytes.subarray(0, 5).toString() === "%PDF-" ? "application/pdf"
    : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" : null;
  if (!actualType || actualType !== file.type || !bytes.length || bytes.length > maxBytes || !file.name || file.name.length > 255 || /[\x00-\x1f/\\]/.test(file.name)) throw new FacultyActionError("Upload a PDF, PNG or JPEG up to 5 MiB with a valid filename.", 400);
  const storageKey = randomUUID(), target = storagePath(storageKey);
  let written = false;
  try {
    return await facultyTransaction(async db => {
      const record = await workflowObservation(db, observationId), now = new Date();
      const professor = await db.professor.findUnique({ where: { userId: user.id } });
      if (!professor || ![record.signup.professorId, record.observerId].includes(professor.professorId)) throw new FacultyActionError("Forbidden", 403);
      if (record.cycle.observationDeadline >= now || record.cycle.feedbackDeadline < now) throw new FacultyActionError("Supporting material can be uploaded only during the feedback window.");
      await touchObservation(db, record);
      if (await db.feedbackAttachment.count({ where: { observationId, ownerId: user.id } }) >= 3) throw new FacultyActionError("At most three supporting files are allowed per observation and participant.");
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, bytes, { flag: "wx", mode: 0o600 }); written = true;
      const attachment = await db.feedbackAttachment.create({ data: { ownerId: user.id, observationId, originalName: file.name, contentType: actualType, sizeBytes: bytes.length, storageKey } });
      return { attachmentId: attachment.attachmentId, name: attachment.originalName };
    });
  } catch (error) { if (written) await unlink(target).catch(() => {}); throw error; }
}

export async function readFacultyAttachment(user: AccountUser, attachmentId: string) {
  requireFacultyGrants(user, "profile.read.own", "feedback.read.own"); workflowId(attachmentId);
  const attachment = await getPrisma().feedbackAttachment.findFirst({ where: { attachmentId, ownerId: user.id } });
  if (!attachment) throw new FacultyActionError("Attachment not found.", 404);
  // User uploads are runtime private data, never deployment/build assets.
  return { bytes: await readFile(/* turbopackIgnore: true */ storagePath(attachment.storageKey)), name: attachment.originalName, contentType: attachment.contentType };
}

export async function removeFacultyAttachmentFile(key: string) {
  try { await unlink(storagePath(key)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
