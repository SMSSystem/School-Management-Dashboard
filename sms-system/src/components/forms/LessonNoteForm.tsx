import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import InputField from "../InputField";
import NoDepartmentNotice from "../NoDepartmentNotice";
import { db, type LessonNoteFile, type LessonNoteLink } from "@/lib/firebase";
import {
  DocumentValidationError,
  formatFileSize,
  processDocumentUpload,
  uploadLimitLabel,
  type ProcessedDocument,
} from "@/lib/documentUpload";
import { commitWithBlobs, deleteBlob, largeUploadPolicy } from "@/lib/blobStore";
import { attachmentData, existingBlobKeys } from "@/lib/lessonNoteFile";
import {
  MAX_LESSON_NOTE_FILES,
  newLessonNoteFileId,
  noteFiles,
  planFileChanges,
  validateAddedFile,
} from "@/lib/lessonNoteFiles";
import { useAuth } from "@/lib/AuthContext";
import { actorName, buildAuditEntry, staffFallback } from "@/lib/auditLog";
import { lessonNoteDetail } from "@/lib/teacherAudit";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import {
  MAX_LESSON_NOTE_LINKS,
  validateLessonNoteLinks,
  cleanLessonNoteLinks,
} from "@/lib/lessonNoteLinks";
import {
  classesTaughtBy,
  classOptionsFor,
  subjectsTaughtBy,
} from "@/lib/teacherScope";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(150, "Name must be 150 characters or less."),
  classId: z.string().optional(),
  subjectId: z.string().optional(),
});

type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;
type LinkRow = { url: string; label: string };

const SELECT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";
const LABEL_CLS = "text-xs text-gray-500 dark:text-gray-300";
const BUTTON_CLS =
  "text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700";

// LESSON_NOTES_FEATURE_SPEC.md §6/§7. The note and its file are two
// documents, written in ONE batch so they can't half-apply (firestore.rules
// reads the parent note via getAfter() for exactly this reason).
const LessonNoteForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, institutionId, displayName } = useAuth();
  const isTeacherRole = role === "senior_teacher" || role === "regular_teacher";
  // Teachers and institution admins may attach up to 5MB (kept in the Realtime
  // Database); every other role keeps the 500KB limit.
  const uploadPolicy = largeUploadPolicy(role);

  const { data: rawSubjects = [] } = useInstitutionSubjects();
  const { data: allClasses = [] } = useInstitutionClasses();

  // Teachers pick only what they teach (UI-level, Gradebook precedent).
  const subjects = useMemo(
    () => (isTeacherRole && user ? subjectsTaughtBy(rawSubjects, user.uid) : rawSubjects),
    [isTeacherRole, user, rawSubjects],
  );
  const taughtClasses = useMemo(
    () => (isTeacherRole && user ? classesTaughtBy(allClasses, rawSubjects, user.uid) : allClasses),
    [isTeacherRole, user, allClasses, rawSubjects],
  );

  // Own departmentId — denormalized onto the note at creation because the
  // narrow senior_teacher rule keys off it. Not on AuthContext (that field is
  // a display name), so read from the user's own profile.
  const [ownDepartmentId, setOwnDepartmentId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!isTeacherRole || !user || type === "update") return;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => setOwnDepartmentId(snap.data()?.departmentId as string | undefined))
      .catch(() => setOwnDepartmentId(undefined));
  }, [isTeacherRole, user, type]);

  const existingClassId = data?.classId as string | undefined;
  const existingSubjectId = data?.subjectId as string | undefined;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: (data?.name as string | undefined) ?? "",
      classId: existingClassId ?? "",
      subjectId: existingSubjectId ?? "",
    },
  });

  const selectedSubject = rawSubjects.find((s) => s.id === watch("subjectId"));
  const classOptions = classOptionsFor(selectedSubject, taughtClasses);

  // Keep the note's current class/subject selectable even when the editor
  // (e.g. a senior teacher editing a colleague's note) doesn't teach it, so
  // opening the form doesn't silently blank the value.
  const subjectChoices = useMemo(() => {
    const list = [...subjects];
    if (existingSubjectId && !list.some((s) => s.id === existingSubjectId)) {
      list.push({
        id: existingSubjectId,
        name: (data?.subjectName as string | undefined) ?? "Current subject",
      } as (typeof subjects)[number]);
    }
    return list;
  }, [subjects, existingSubjectId, data?.subjectName]);
  const classChoices = useMemo(() => {
    const list = [...classOptions];
    if (existingClassId && !list.some((c) => c.id === existingClassId)) {
      list.push({
        id: existingClassId,
        name: (data?.className as string | undefined) ?? "Current class",
      } as (typeof classOptions)[number]);
    }
    return list;
  }, [classOptions, existingClassId, data?.className]);

  const existingLinks = (data?.resourceLinks as unknown as LessonNoteLink[] | undefined) ?? [];
  const [links, setLinks] = useState<LinkRow[]>(
    existingLinks.length
      ? existingLinks.map((l) => ({ url: l.url, label: l.label ?? "" }))
      : [{ url: "", label: "" }],
  );

  // A note's files: each file's body lives in its own sub-document and is
  // deliberately NOT loaded for editing — only the metadata on the note is shown.
  // Existing files stay unless removed; chosen files are added; Remove drops one.
  // The page passes the whole note object (see FormModal's loose FormRecord
  // type), so the file fields are read via a cast.
  const existingFiles = useMemo(
    () => (type === "update" && data ? noteFiles(data as unknown as Parameters<typeof noteFiles>[0]) : []),
    [type, data],
  );
  const [keptIds, setKeptIds] = useState<string[]>(() => existingFiles.map((f) => f.id));
  const [added, setAdded] = useState<(ProcessedDocument & { id: string })[]>([]);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const keptExisting = existingFiles.filter((f) => keptIds.includes(f.id));
  const fileCount = keptExisting.length + added.length;

  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    if (!institutionId || !user) return;

    const linkError = validateLessonNoteLinks(links);
    if (linkError) {
      setSubmitError(linkError);
      return;
    }
    const resourceLinks = cleanLessonNoteLinks(links);

    try {
      const cls = classChoices.find((c) => c.id === formData.classId);
      const subject = subjectChoices.find((s) => s.id === formData.subjectId);
      const updateId = type === "update" ? data?.id : undefined;
      if (type === "update" && typeof updateId !== "string") return;

      // Which file documents this save writes and deletes, and the note's new id
      // list. The removed files' Realtime Database keys are read BEFORE the write
      // below deletes the records that hold them; those files are removed only
      // after the write succeeds.
      const plan = planFileChanges({
        existingIds: existingFiles.map((f) => f.id),
        keptIds,
        addedIds: added.map((f) => f.id),
      });
      const oldBlobKeys =
        type === "update" && plan.deleteIds.length > 0
          ? await existingBlobKeys(institutionId, updateId as string, plan.deleteIds)
          : {};
      // Each file's metadata on the note: the kept ones (in their order), then the new.
      const attachments: LessonNoteFile[] = plan.attachmentIds.map((id) => {
        const file = keptExisting.find((f) => f.id === id) ?? added.find((f) => f.id === id);
        return { id, fileName: file!.fileName, mimeType: file!.mimeType, size: file!.size };
      });

      // A file over 500KB is uploaded first and the note then points at it; if
      // the save fails every upload is taken back out (see commitWithBlobs).
      await commitWithBlobs(
        institutionId,
        added,
        user.uid,
        async (blobKeys) => {
          const batch = writeBatch(db);
          let noteId: string;
          let noteRef;

          if (type === "create") {
            noteRef = doc(institutionCollection(institutionId, "lessonNotes"));
            noteId = noteRef.id;
            batch.set(noteRef, {
              institutionId,
              name: formData.name,
              ...(formData.classId && { classId: formData.classId, className: cls?.name ?? "" }),
              ...(formData.subjectId && {
                subjectId: formData.subjectId,
                subjectName: subject?.name ?? "",
              }),
              teacherId: user.uid,
              teacherName: displayName ?? "",
              teacherRole: role as "regular_teacher" | "senior_teacher" | "institution_admin",
              ...(ownDepartmentId && { departmentId: ownDepartmentId }),
              hasAttachment: attachments.length > 0,
              attachments,
              attachmentIds: plan.attachmentIds,
              resourceLinks,
              createdBy: user.uid,
              createdByRole: role ?? "",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            const id = updateId as string;
            noteId = id;
            noteRef = institutionDoc(institutionId, "lessonNotes", id);
            // Ownership fields (teacherId, teacherRole, departmentId, createdBy,
            // createdAt) are deliberately never sent — firestore.rules freezes them.
            // The single-file fields of an older note are dropped as it is saved.
            batch.update(noteRef, {
              name: formData.name,
              classId: formData.classId ? formData.classId : deleteField(),
              className: formData.classId ? (cls?.name ?? "") : deleteField(),
              subjectId: formData.subjectId ? formData.subjectId : deleteField(),
              subjectName: formData.subjectId ? (subject?.name ?? "") : deleteField(),
              resourceLinks,
              hasAttachment: attachments.length > 0,
              attachments,
              attachmentIds: plan.attachmentIds,
              attachmentFileName: deleteField(),
              attachmentMimeType: deleteField(),
              attachmentSize: deleteField(),
              updatedAt: serverTimestamp(),
            });
          }
          added.forEach((file, i) => {
            batch.set(doc(noteRef, "attachment", file.id), attachmentData(file, blobKeys[i]));
          });
          plan.deleteIds.forEach((fileId) => batch.delete(doc(noteRef, "attachment", fileId)));

          // The note and its audit entry in ONE batch. The target is the note's class
          // when it has one, else the note itself (a note's class is optional).
          if (institutionId !== "*") {
            batch.set(
              doc(institutionCollection(institutionId, "audit_log")),
              buildAuditEntry({
                institutionId,
                eventType: "lesson_note_edit",
                detail: lessonNoteDetail({
                  noteName: formData.name,
                  className: formData.classId ? cls?.name : undefined,
                  subjectName: formData.subjectId ? subject?.name : undefined,
                  created: type === "create",
                }),
                targetUid: formData.classId || noteId,
                targetName: (formData.classId && cls?.name) || formData.name,
                performedBy: user.uid,
                performedByName: actorName(displayName, user.email, staffFallback(role)),
              }),
            );
          }

          await batch.commit();
        },
        setUploading,
      );
      for (const key of Object.values(oldBlobKeys)) void deleteBlob(institutionId, key);
      onClose?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save lesson note.");
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new lesson note" : "Edit lesson note"}
      </h1>
      <NoDepartmentNotice />
      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="Name" name="name" register={register} error={errors.name} />

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Subject (optional)</label>
          <select
            className={SELECT_CLS}
            {...register("subjectId")}
            onChange={(e) => {
              setValue("subjectId", e.target.value);
              // A new subject can narrow the class list — clear a class that
              // may no longer apply.
              setValue("classId", "");
            }}
          >
            <option value="">None</option>
            {subjectChoices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Class (optional)</label>
          <select className={SELECT_CLS} {...register("classId")}>
            <option value="">None</option>
            {classChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400">
            Students and parents only see notes linked to a class.
          </p>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <label className={LABEL_CLS}>Files (optional, up to {MAX_LESSON_NOTE_FILES})</label>
          {fileCount > 0 && (
            <ul className="flex flex-col gap-2">
              {keptExisting.map((f) => (
                <li key={f.id} className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-gray-500 dark:text-gray-300 break-all">
                    {f.fileName} ({formatFileSize(f.size)})
                  </span>
                  <button
                    type="button"
                    onClick={() => setKeptIds((prev) => prev.filter((id) => id !== f.id))}
                    className={`${BUTTON_CLS} text-red-600! dark:text-red-400!`}
                    aria-label={`Remove ${f.fileName}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
              {added.map((f) => (
                <li key={f.id} className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-gray-500 dark:text-gray-300 break-all">
                    {f.fileName} ({formatFileSize(f.size)})
                  </span>
                  <button
                    type="button"
                    onClick={() => setAdded((prev) => prev.filter((x) => x.id !== f.id))}
                    className={`${BUTTON_CLS} text-red-600! dark:text-red-400!`}
                    aria-label={`Remove ${f.fileName}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fileCount < MAX_LESSON_NOTE_FILES && (
            <label className={`cursor-pointer self-start ${BUTTON_CLS} ${attachmentLoading ? "opacity-50 pointer-events-none" : ""}`}>
              {fileCount > 0 ? "Add another file" : "Upload file"}
              <input
                type="file"
                multiple
                disabled={attachmentLoading}
                accept="application/pdf,.pdf,.docx,.pptx,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={async (e) => {
                  const chosen = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (chosen.length === 0) return;
                  setAttachmentError(null);
                  setAttachmentLoading(true);
                  const accepted: (ProcessedDocument & { id: string })[] = [];
                  let problem: string | null = null;
                  for (const file of chosen) {
                    try {
                      const processed = await processDocumentUpload(file, { large: uploadPolicy });
                      problem = validateAddedFile([...keptExisting, ...added, ...accepted], processed);
                      if (problem) break;
                      accepted.push({ ...processed, id: newLessonNoteFileId() });
                    } catch (err) {
                      problem =
                        err instanceof DocumentValidationError ? err.message : "Could not process this file.";
                      break;
                    }
                  }
                  if (accepted.length > 0) setAdded((prev) => [...prev, ...accepted]);
                  setAttachmentError(problem);
                  setAttachmentLoading(false);
                }}
              />
            </label>
          )}
          <p className="text-xs text-gray-400">
            PDF, Word (.docx), PowerPoint (.pptx), JPEG, PNG, or WEBP — {uploadLimitLabel(uploadPolicy)} max each,
            up to {MAX_LESSON_NOTE_FILES} files.
          </p>
          {attachmentLoading && <p className="text-xs text-gray-400">Processing file…</p>}
          {attachmentError && <p className="text-xs text-red-400">{attachmentError}</p>}
        </div>

        <div className="flex flex-col gap-2 w-full">
          <label className={LABEL_CLS}>
            Links (optional, up to {MAX_LESSON_NOTE_LINKS}) — YouTube, articles, etc.
          </label>
          {links.map((row, i) => (
            <div key={i} className="flex gap-2 items-center flex-wrap md:flex-nowrap">
              <input
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={row.url}
                aria-label={`Link ${i + 1} URL`}
                onChange={(e) =>
                  setLinks((prev) => prev.map((r, j) => (j === i ? { ...r, url: e.target.value } : r)))
                }
                className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full md:w-3/5 dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <input
                type="text"
                placeholder="Label (optional)"
                value={row.label}
                aria-label={`Link ${i + 1} label`}
                maxLength={100}
                onChange={(e) =>
                  setLinks((prev) => prev.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))
                }
                className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full md:w-2/5 dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                aria-label={`Remove link ${i + 1}`}
                onClick={() =>
                  setLinks((prev) => (prev.length === 1 ? [{ url: "", label: "" }] : prev.filter((_, j) => j !== i)))
                }
                className={`${BUTTON_CLS} text-red-600! dark:text-red-400!`}
              >
                Remove
              </button>
            </div>
          ))}
          {links.length < MAX_LESSON_NOTE_LINKS && (
            <button
              type="button"
              onClick={() => setLinks((prev) => [...prev, { url: "", label: "" }])}
              className={`${BUTTON_CLS} self-start`}
            >
              Add link
            </button>
          )}
        </div>
      </div>

      {submitError && <p className="text-xs text-red-400">{submitError}</p>}
      {uploading && (
        <p className="text-xs text-gray-500 dark:text-gray-300">
          Uploading the files… keep this window open until it finishes.
        </p>
      )}

      <button
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
        disabled={isSubmitting || attachmentLoading}
      >
        {uploading ? "Uploading files…" : isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default LessonNoteForm;
