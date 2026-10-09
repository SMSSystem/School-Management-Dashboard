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
import { db, type LessonNoteLink } from "@/lib/firebase";
import {
  DocumentValidationError,
  formatFileSize,
  processDocumentUpload,
  uploadLimitLabel,
  type ProcessedDocument,
} from "@/lib/documentUpload";
import { commitWithBlob, deleteBlob, largeUploadPolicy } from "@/lib/blobStore";
import { attachmentData, existingBlobKey } from "@/lib/lessonNoteFile";
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

  // The file itself lives in a sub-document and is deliberately NOT loaded
  // for editing — only its metadata is on the note. "Keep" leaves the stored
  // file untouched; choosing a new file replaces it; Remove deletes it.
  // The page passes the whole note object (see FormModal's loose FormRecord
  // type, which can't express a boolean), so hasAttachment is read via a cast.
  const hadAttachment =
    type === "update" && (data as { hasAttachment?: boolean } | undefined)?.hasAttachment === true;
  const [newAttachment, setNewAttachment] = useState<ProcessedDocument | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const keepsExisting = hadAttachment && !removeExisting && !newAttachment;
  const hasFile = !!newAttachment || keepsExisting;

  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    if (!institutionId || !user) return;

    const linkError = validateLessonNoteLinks(links);
    if (linkError) {
      setSubmitError(linkError);
      return;
    }
    const resourceLinks = cleanLessonNoteLinks(links);
    if (!hasFile && resourceLinks.length === 0) {
      setSubmitError("Add a file or at least one link.");
      return;
    }

    try {
      const cls = classChoices.find((c) => c.id === formData.classId);
      const subject = subjectChoices.find((s) => s.id === formData.subjectId);
      const updateId = type === "update" ? data?.id : undefined;
      if (type === "update" && typeof updateId !== "string") return;

      // The note's current large file (if any), read BEFORE the write below
      // replaces or deletes the record that holds its key. It is removed from the
      // Realtime Database only after that write succeeds.
      const oldBlobKey =
        type === "update" && hadAttachment && (newAttachment || removeExisting)
          ? await existingBlobKey(institutionId, updateId as string)
          : null;

      // A file over 500KB is uploaded first and the note then points at it; if
      // the save fails the upload is taken back out (see commitWithBlob).
      await commitWithBlob(
        institutionId,
        newAttachment,
        user.uid,
        async (blobKey) => {
          const batch = writeBatch(db);
          let noteId: string;

          if (type === "create") {
            const noteRef = doc(institutionCollection(institutionId, "lessonNotes"));
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
              hasAttachment: !!newAttachment,
              ...(newAttachment && {
                attachmentFileName: newAttachment.fileName,
                attachmentMimeType: newAttachment.mimeType,
                attachmentSize: newAttachment.size,
              }),
              resourceLinks,
              createdBy: user.uid,
              createdByRole: role ?? "",
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            if (newAttachment) {
              batch.set(doc(noteRef, "attachment", "data"), attachmentData(newAttachment, blobKey));
            }
          } else {
            const id = updateId as string;
            noteId = id;
            const noteRef = institutionDoc(institutionId, "lessonNotes", id);
            // Ownership fields (teacherId, teacherRole, departmentId, createdBy,
            // createdAt) are deliberately never sent — firestore.rules freezes them.
            const fileFields: Record<string, unknown> = newAttachment
              ? {
                  hasAttachment: true,
                  attachmentFileName: newAttachment.fileName,
                  attachmentMimeType: newAttachment.mimeType,
                  attachmentSize: newAttachment.size,
                }
              : removeExisting
                ? {
                    hasAttachment: false,
                    attachmentFileName: deleteField(),
                    attachmentMimeType: deleteField(),
                    attachmentSize: deleteField(),
                  }
                : {};
            batch.update(noteRef, {
              name: formData.name,
              classId: formData.classId ? formData.classId : deleteField(),
              className: formData.classId ? (cls?.name ?? "") : deleteField(),
              subjectId: formData.subjectId ? formData.subjectId : deleteField(),
              subjectName: formData.subjectId ? (subject?.name ?? "") : deleteField(),
              resourceLinks,
              ...fileFields,
              updatedAt: serverTimestamp(),
            });
            const attachmentRef = doc(noteRef, "attachment", "data");
            if (newAttachment) {
              batch.set(attachmentRef, attachmentData(newAttachment, blobKey));
            } else if (removeExisting) {
              batch.delete(attachmentRef);
            }
          }

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
      if (oldBlobKey) void deleteBlob(institutionId, oldBlobKey);
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
          <label className={LABEL_CLS}>File (optional)</label>
          <div className="flex items-center gap-3 flex-wrap">
            <label className={`cursor-pointer ${BUTTON_CLS}`}>
              {hasFile ? "Replace file" : "Upload file"}
              <input
                type="file"
                accept="application/pdf,.pdf,.docx,.pptx,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setAttachmentError(null);
                  setAttachmentLoading(true);
                  try {
                    setNewAttachment(await processDocumentUpload(file, { large: uploadPolicy }));
                    setRemoveExisting(false);
                  } catch (err) {
                    setAttachmentError(
                      err instanceof DocumentValidationError
                        ? err.message
                        : "Could not process this file.",
                    );
                  } finally {
                    setAttachmentLoading(false);
                  }
                }}
              />
            </label>
            {newAttachment && (
              <span className="text-xs text-gray-500 dark:text-gray-300">
                {newAttachment.fileName} ({formatFileSize(newAttachment.size)})
              </span>
            )}
            {keepsExisting && (
              <span className="text-xs text-gray-500 dark:text-gray-300">
                Current file: {(data?.attachmentFileName as string | undefined) ?? "attachment"}
              </span>
            )}
            {hasFile && (
              <button
                type="button"
                onClick={() => {
                  setAttachmentError(null);
                  setNewAttachment(null);
                  if (hadAttachment) setRemoveExisting(true);
                }}
                className={`${BUTTON_CLS} text-red-600! dark:text-red-400!`}
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400">
            PDF, Word (.docx), PowerPoint (.pptx), JPEG, PNG, or WEBP — {uploadLimitLabel(uploadPolicy)} max.
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
          Uploading the file… keep this window open until it finishes.
        </p>
      )}

      <button
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
        disabled={isSubmitting || attachmentLoading}
      >
        {uploading ? "Uploading file…" : isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default LessonNoteForm;
