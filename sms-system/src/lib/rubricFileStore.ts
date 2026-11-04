import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  type DocumentReference,
  type WriteBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { institutionCollection, institutionDoc } from "./paths";
import { buildAuditEntry } from "./auditEntry";
import { dataUrlToBlob } from "./downloadFile";
import type { ProcessedRubricFile } from "./rubricFile";
import type { RubricDocument, RubricFileDocument } from "@/types/assessment";

// Reads and writes a rubric's stored file (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 4). The body is at
// rubrics/{id}/file/current, read only when someone clicks Download; the rubric itself holds only a summary, because the list
// page and the assignment form read every rubric. Each change is one batch: the rubric, the file and the audit entry, so they
// can't disagree. Firestore does not cascade, so deleting a rubric has to remove its file here. Never put a body through
// React Query: its cache persists to sessionStorage.

const RUBRIC_FILE_ID = "current";

export type RubricActor = { uid: string; name: string; role: string };

const rubricRef = (institutionId: string, rubricId: string) =>
  institutionDoc(institutionId, "rubrics", rubricId);
const fileRef = (rubric: DocumentReference) =>
  doc(rubric, "file", RUBRIC_FILE_ID);

const summaryOf = (file: ProcessedRubricFile, actor: RubricActor) => ({
  fileName: file.fileName,
  mimeType: file.mimeType,
  size: file.size,
  uploadedBy: actor.uid,
  uploadedByName: actor.name,
  uploadedAt: serverTimestamp(),
});

const bodyOf = (
  institutionId: string,
  file: ProcessedRubricFile,
  actor: RubricActor,
) => ({
  institutionId,
  dataUrl: file.dataUrl,
  fileName: file.fileName,
  mimeType: file.mimeType,
  size: file.size,
  uploadedBy: actor.uid,
  uploadedAt: serverTimestamp(),
});

const auditOf = (
  institutionId: string,
  rubricId: string,
  title: string,
  detail: string,
  actor: Pick<RubricActor, "uid" | "name">,
) =>
  buildAuditEntry({
    institutionId,
    eventType: "rubric_file_edit",
    detail,
    targetUid: rubricId,
    targetName: title.slice(0, 200),
    performedBy: actor.uid,
    performedByName: actor.name,
  });

const addAudit = (batch: WriteBatch, ...args: Parameters<typeof auditOf>) =>
  batch.set(doc(institutionCollection(args[0], "audit_log")), auditOf(...args));

/** Saves a new rubric that holds only a file. A grid can be added afterwards through Edit. */
export async function createRubricFromFile(p: {
  institutionId: string;
  title: string;
  description: string;
  file: ProcessedRubricFile;
  actor: RubricActor;
}): Promise<void> {
  const rubric = doc(institutionCollection(p.institutionId, "rubrics"));
  const batch = writeBatch(db);
  batch.set(rubric, {
    institutionId: p.institutionId,
    title: p.title,
    ...(p.description && { description: p.description }),
    criteria: [],
    createdBy: p.actor.uid,
    createdByRole: p.actor.role,
    createdAt: serverTimestamp(),
    file: summaryOf(p.file, p.actor),
  });
  batch.set(fileRef(rubric), bodyOf(p.institutionId, p.file, p.actor));
  addAudit(
    batch,
    p.institutionId,
    rubric.id,
    p.title,
    `Uploaded "${p.file.fileName}" as a new rubric`,
    p.actor,
  );
  await batch.commit();
}

/** Adds a file to a rubric or replaces its file. The person doing it becomes the file's owner, as the rules require. */
export async function replaceRubricFile(p: {
  institutionId: string;
  rubricId: string;
  title: string;
  file: ProcessedRubricFile;
  actor: RubricActor;
}): Promise<void> {
  const rubric = rubricRef(p.institutionId, p.rubricId);
  const batch = writeBatch(db);
  batch.update(rubric, { file: summaryOf(p.file, p.actor) });
  batch.set(fileRef(rubric), bodyOf(p.institutionId, p.file, p.actor));
  addAudit(
    batch,
    p.institutionId,
    p.rubricId,
    p.title,
    `Replaced the rubric's file with "${p.file.fileName}"`,
    p.actor,
  );
  await batch.commit();
}

/** Removes a rubric's file and keeps its grid. The page does not offer this on a file-only rubric, which would be left empty. */
export async function removeRubricFile(p: {
  institutionId: string;
  rubricId: string;
  title: string;
  fileName: string;
  actor: RubricActor;
}): Promise<void> {
  const rubric = rubricRef(p.institutionId, p.rubricId);
  const batch = writeBatch(db);
  batch.update(rubric, { file: deleteField() });
  batch.delete(fileRef(rubric));
  addAudit(
    batch,
    p.institutionId,
    p.rubricId,
    p.title,
    `Removed the file "${p.fileName}"`,
    p.actor,
  );
  await batch.commit();
}

/**
 * Deletes a rubric and any file it has. The rubric is read first, because the rule that lets an uploader delete a file reads
 * that file, and fails on one that doesn't exist. Assignments that use the rubric then show it as missing.
 */
export async function deleteRubricAndFile(
  institutionId: string,
  rubricId: string,
  actor?: Pick<RubricActor, "uid" | "name">,
): Promise<void> {
  const rubric = rubricRef(institutionId, rubricId);
  const data = (await getDoc(rubric)).data() as RubricDocument | undefined;
  if (!data?.file) {
    await deleteDoc(rubric);
    return;
  }
  const batch = writeBatch(db);
  batch.delete(fileRef(rubric));
  batch.delete(rubric);
  if (actor) {
    addAudit(
      batch,
      institutionId,
      rubricId,
      data.title,
      `Deleted the rubric and its file "${data.file.fileName}"`,
      actor,
    );
  }
  await batch.commit();
}

/** The stored file, read only now, on request. */
export async function fetchRubricFile(
  institutionId: string,
  rubricId: string,
): Promise<{ blob: Blob; fileName: string }> {
  const snap = await getDoc(fileRef(rubricRef(institutionId, rubricId)));
  if (!snap.exists())
    throw new Error("This rubric's file is no longer available.");
  const file = snap.data() as RubricFileDocument;
  return { blob: await dataUrlToBlob(file.dataUrl), fileName: file.fileName };
}
