import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import InputField from "../InputField";
import {
  ASSIGNMENT_VALUE_TYPE_LABELS,
  ASSIGNMENT_VALUE_TYPES,
  db,
} from "@/lib/firebase";
import {
  DocumentValidationError,
  processDocumentUpload,
  type ProcessedDocument,
} from "@/lib/documentUpload";
import { useAuth } from "@/lib/AuthContext";
import {
  institutionCollection,
  institutionDoc,
  institutionSubcollection,
} from "@/lib/paths";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useInstitutionSubjects } from "@/hooks/useInstitutionSubjects";

const schema = z
  .object({
    title: z.string().min(1, "Title is required.").max(150, "Title must be 150 characters or less."),
    type: z.enum(ASSIGNMENT_VALUE_TYPES, {
      message: "Assignment type is required.",
    }),
    otherTypeLabel: z
      .string()
      .max(100, "Must be 100 characters or less.")
      .optional(),
    status: z.enum(["draft", "published"]),
    termId: z.string().min(1, "Term is required."),
    subjectId: z.string().min(1, "Subject is required."),
    classId: z.string().min(1, "Class is required."),
    teacherId: z.string().min(1, "Teacher is required."),
    dueDate: z.string().min(1, "Due date is required."),
    description: z
      .string()
      .max(2000, "Description must be 2000 characters or less.")
      .optional(),
    gradingMode: z.enum(["standalone", "gradebook"]),
    gradebookColumnId: z.string().optional(),
    rubricId: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "other" && !val.otherTypeLabel?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["otherTypeLabel"],
        message: "Required when type is \"Other\".",
      });
    }
    if (val.gradingMode === "gradebook" && !val.gradebookColumnId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gradebookColumnId"],
        message: "Select a gradebook column.",
      });
    }
  });

type FormData = Partial<
  Record<string, string | number | readonly string[] | undefined>
>;
const SELECT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";
const LABEL_CLS = "text-xs text-gray-500 dark:text-gray-300";

const AssignmentForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, institutionId } = useAuth();
  const isTeacherRole = role === "senior_teacher" || role === "regular_teacher";

  const { data: rawTerms = [] } = useInstitutionTerms();
  const terms = useMemo(
    () => [...rawTerms].sort((a, b) => a.name.localeCompare(b.name)),
    [rawTerms],
  );
  const { data: subjects = [] } = useInstitutionSubjects();
  const { data: classes = [] } = useInstitutionClasses();
  // teacherId -> {departmentId, role}. departmentId is needed at write time
  // (the deployed `assignments` rule lets a senior_teacher edit any
  // assignment in their department via this field); role feeds the new
  // denormalized teacherRole field (ASSIGNMENTS_FEATURE_SPEC.md §4.1).
  const [teacherMetaById, setTeacherMetaById] = useState<
    Record<string, { departmentId?: string; role?: "regular_teacher" | "senior_teacher" }>
  >({});
  const [ownName, setOwnName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [attachment, setAttachment] = useState<ProcessedDocument | null>(() => {
    const dataUrl = data?.attachmentDataUrl as string | undefined;
    if (!dataUrl) return null;
    return {
      dataUrl,
      fileName: (data?.attachmentFileName as string | undefined) ?? "attachment",
      mimeType:
        (data?.attachmentMimeType as ProcessedDocument["mimeType"] | undefined) ??
        "application/pdf",
      size: (data?.attachmentSize as number | undefined) ?? 0,
    };
  });
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // Rubric picker options — institutions/{id}/rubrics, firestore.rules §5.2
  // (Implementation Order step 2). .catch() defaults to an empty list rather
  // than surfacing a load error here; an empty rubric picker is harmless
  // (rubricId stays optional), so this form degrades quietly instead of
  // blocking assignment creation over it.
  const [rubrics, setRubrics] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    if (!institutionId) return;
    getDocs(institutionCollection(institutionId, "rubrics"))
      .then((snap) => {
        setRubrics(
          snap.docs.map((d) => ({
            id: d.id,
            title: (d.data().title as string | undefined) ?? "Untitled rubric",
          })),
        );
      })
      .catch(() => setRubrics([]));
  }, [institutionId]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: (data?.title as string | undefined) ?? "",
      type: (data?.type as (typeof ASSIGNMENT_VALUE_TYPES)[number] | undefined) ?? "homework",
      otherTypeLabel: (data?.otherTypeLabel as string | undefined) ?? "",
      status: (data?.status as "draft" | "published" | undefined) ?? "draft",
      termId: (data?.termId as string | undefined) ?? "",
      subjectId: (data?.subjectId as string | undefined) ?? "",
      classId: (data?.classId as string | undefined) ?? "",
      teacherId: (data?.teacherId as string | undefined) ?? "",
      dueDate: (data?.dueDate as string | undefined) ?? "",
      description: (data?.description as string | undefined) ?? "",
      // Defaults to "gradebook" per the resolved design decision that
      // linking into the real Gradebook grid is the default grading path,
      // not standalone (ASSIGNMENTS_FEATURE_SPEC.md §3 decision 5).
      gradingMode:
        (data?.gradingMode as "standalone" | "gradebook" | undefined) ?? "gradebook",
      gradebookColumnId: (data?.gradebookColumnId as string | undefined) ?? "",
      rubricId: (data?.rubricId as string | undefined) ?? "",
    },
  });

  const watchedSubjectId = watch("subjectId");
  const watchedClassId = watch("classId");
  const watchedTermId = watch("termId");
  const watchedType = watch("type");
  const watchedGradingMode = watch("gradingMode");
  const selectedSubject = subjects.find((s) => s.id === watchedSubjectId);

  // Gradebook column picker options — only fetched in "gradebook" mode, once
  // class/subject/term are all chosen (gradebookId is deterministic:
  // classId_subjectId_termId, same as list/gradebook/index.tsx).
  const gradebookId =
    watchedClassId && watchedSubjectId && watchedTermId
      ? `${watchedClassId}_${watchedSubjectId}_${watchedTermId}`
      : null;
  const [gradebookColumns, setGradebookColumns] = useState<
    { id: string; label: string; maxScore: number; order: number }[]
  >([]);
  useEffect(() => {
    if (!institutionId || !gradebookId || watchedGradingMode !== "gradebook") {
      setGradebookColumns([]);
      return;
    }
    getDocs(
      institutionSubcollection(institutionId, "gradebooks", gradebookId, "columns"),
    )
      .then((snap) => {
        setGradebookColumns(
          snap.docs
            .map((d) => ({
              id: d.id,
              label: (d.data().label as string | undefined) ?? "Untitled column",
              maxScore: (d.data().maxScore as number | undefined) ?? 0,
              order: (d.data().order as number | undefined) ?? 0,
            }))
            .sort((a, b) => a.order - b.order),
        );
      })
      .catch(() => setGradebookColumns([]));
  }, [institutionId, gradebookId, watchedGradingMode]);

  // Locked teacher display: own name on create, whoever's already on the
  // document (not necessarily self) on update — never silently reassigns.
  const lockedTeacherId =
    type === "update" && data?.teacherId
      ? String(data.teacherId)
      : (user?.uid ?? "");
  const lockedTeacherName =
    type === "update" && data?.teacherName ? String(data.teacherName) : ownName;

  useEffect(() => {
    if (!isTeacherRole || !user || type === "update") return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setOwnName((snap.data().name as string) ?? "");
    });
  }, [isTeacherRole, user, type]);

  useEffect(() => {
    if (!institutionId) return;
    getDocs(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "in", ["regular_teacher", "senior_teacher"]),
      ),
    ).then((snap) => {
      const map: Record<
        string,
        { departmentId?: string; role?: "regular_teacher" | "senior_teacher" }
      > = {};
      snap.docs.forEach((d) => {
        const docData = d.data();
        map[d.id] = {
          departmentId: docData.departmentId as string | undefined,
          role: docData.role as "regular_teacher" | "senior_teacher" | undefined,
        };
      });
      setTeacherMetaById(map);
    });
  }, [institutionId]);

  useEffect(() => {
    if (isTeacherRole && lockedTeacherId) {
      setValue("teacherId", lockedTeacherId, { shouldValidate: true });
    }
  }, [isTeacherRole, lockedTeacherId, setValue]);

  const classOptions = !selectedSubject
    ? classes
    : selectedSubject.classScope === "institution" ||
        selectedSubject.classIds.length === 0
      ? classes
      : classes.filter((c) => selectedSubject.classIds.includes(c.id));

  const teacherOptions = selectedSubject
    ? selectedSubject.teacherIds.map((id, i) => ({
        id,
        name: selectedSubject.teacherNames[i] ?? id,
      }))
    : [];

  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    if (!institutionId) return;
    try {
      const term = terms.find((t) => t.id === formData.termId);
      const cls = classes.find((c) => c.id === formData.classId);
      const teacherId = isTeacherRole
        ? lockedTeacherId
        : String(formData.teacherId ?? "");
      const teacherName = isTeacherRole
        ? lockedTeacherName
        : (teacherOptions.find((t) => t.id === teacherId)?.name ?? "");
      const teacherMeta = teacherMetaById[teacherId];
      const departmentId =
        teacherMeta?.departmentId ??
        (type === "update"
          ? (data?.departmentId as string | undefined)
          : undefined);
      const teacherRole = isTeacherRole
        ? (role as "regular_teacher" | "senior_teacher")
        : (teacherMeta?.role ??
          (type === "update"
            ? (data?.teacherRole as "regular_teacher" | "senior_teacher" | undefined)
            : undefined));
      if (!teacherRole) {
        setSubmitError("Could not determine the selected teacher's role — try again.");
        return;
      }

      // Optional fields: included when set, explicitly cleared with
      // deleteField() on update when unset (addDoc's initial write just
      // omits them — deleteField() only makes sense against an existing doc).
      const optionalFields: Record<string, unknown> = {};
      if (formData.type === "other" && formData.otherTypeLabel) {
        optionalFields.otherTypeLabel = formData.otherTypeLabel;
      } else if (type === "update") {
        optionalFields.otherTypeLabel = deleteField();
      }
      // Locked on update (see the disabled selects above) — sourced from the
      // existing document, never the form, so a stale/tampered formData
      // value can't silently bypass the dedicated conversion action.
      const gradingMode: "standalone" | "gradebook" =
        type === "update"
          ? ((data?.gradingMode as "standalone" | "gradebook" | undefined) ?? "standalone")
          : formData.gradingMode;
      const gradebookColumnId =
        type === "update"
          ? (data?.gradebookColumnId as string | undefined)
          : formData.gradebookColumnId;
      if (gradingMode === "gradebook" && gradebookColumnId) {
        optionalFields.gradebookColumnId = gradebookColumnId;
      } else if (type === "update") {
        optionalFields.gradebookColumnId = deleteField();
      }
      if (formData.rubricId) {
        optionalFields.rubricId = formData.rubricId;
      } else if (type === "update") {
        optionalFields.rubricId = deleteField();
      }
      if (attachment) {
        optionalFields.attachmentDataUrl = attachment.dataUrl;
        optionalFields.attachmentFileName = attachment.fileName;
        optionalFields.attachmentMimeType = attachment.mimeType;
        optionalFields.attachmentSize = attachment.size;
      } else if (type === "update") {
        optionalFields.attachmentDataUrl = deleteField();
        optionalFields.attachmentFileName = deleteField();
        optionalFields.attachmentMimeType = deleteField();
        optionalFields.attachmentSize = deleteField();
      }

      // Falls back to the existing document's own denormalized name on
      // update when the live terms/subjects/classes lookup comes up empty —
      // those come from async reference-data hooks (useInstitutionTerms()/
      // useInstitutionSubjects()/useInstitutionClasses(), each defaulting
      // to `data: [] ` while loading) with no loading-state gate on this
      // form's submit button. Submitting an edit before they've resolved
      // (nothing else on this form needs term/subject/class to have
      // finished loading — they're pre-filled via defaultValues already)
      // used to silently blank these fields to "" instead of leaving the
      // real value alone — confirmed while building this feature's own
      // Playwright QA suite (e2e/08-assignments-workflow.spec.ts), not a
      // hypothetical.
      const termName =
        term?.name ?? (type === "update" ? (data?.termName as string | undefined) : undefined) ?? "";
      const subjectName =
        selectedSubject?.name ?? (type === "update" ? (data?.subjectName as string | undefined) : undefined) ?? "";
      const className =
        cls?.name ?? (type === "update" ? (data?.className as string | undefined) : undefined) ?? "";

      const payload = {
        institutionId,
        termId: formData.termId,
        termName,
        subjectId: formData.subjectId,
        subjectName,
        classId: formData.classId,
        className,
        teacherId,
        teacherName,
        ...(departmentId && { departmentId }),
        teacherRole,
        dueDate: formData.dueDate,
        // Denormalized Timestamp twin of dueDate — see AssignmentDocument
        // (firebase.ts) and ASSIGNMENTS_FEATURE_SPEC.md §4.1/§9.1.
        dueDateTimestamp: Timestamp.fromDate(new Date(formData.dueDate)),
        ...(formData.description && { description: formData.description }),
        title: formData.title,
        type: formData.type,
        status: formData.status,
        gradingMode,
        ...optionalFields,
      };

      if (type === "create") {
        await addDoc(institutionCollection(institutionId, "assignments"), {
          ...payload,
          createdBy: user?.uid ?? "",
          createdByRole: role ?? "",
          createdAt: serverTimestamp(),
        });
      } else {
        const id = data?.id;
        if (typeof id !== "string") {
          console.log(
            "AssignmentForm update: no string ID (mock mode)",
            formData,
          );
          return;
        }
        await updateDoc(
          institutionDoc(institutionId, "assignments", id),
          payload,
        );
      }
      onClose?.();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to save assignment.",
      );
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new assignment" : "Edit assignment"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="Title"
          name="title"
          register={register}
          error={errors.title}
        />

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Term</label>
          <select
            className={SELECT_CLS}
            {...register("termId")}
          >
            <option value="">Select a term</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {errors.termId?.message && (
            <p className="text-xs text-red-400">{errors.termId.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Subject</label>
          <select
            className={SELECT_CLS}
            {...register("subjectId")}
            onChange={(e) => {
              setValue("subjectId", e.target.value);
              setValue("classId", "");
              if (!isTeacherRole) setValue("teacherId", "");
            }}
          >
            <option value="">Select a subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {errors.subjectId?.message && (
            <p className="text-xs text-red-400">{errors.subjectId.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Class</label>
          <select
            className={SELECT_CLS}
            {...register("classId")}
          >
            <option value="">Select a class</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.classId?.message && (
            <p className="text-xs text-red-400">{errors.classId.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Teacher</label>
          {isTeacherRole ? (
            <input
              value={lockedTeacherName}
              disabled
              readOnly
              className="ring-[1.5px] ring-gray-200 p-2 rounded-md text-sm w-full bg-gray-100 text-gray-500 dark:ring-gray-700 dark:bg-gray-800 dark:text-gray-400"
            />
          ) : (
            <select
              className={SELECT_CLS}
              {...register("teacherId")}
            >
              <option value="">Select a teacher</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {errors.teacherId?.message && (
            <p className="text-xs text-red-400">{errors.teacherId.message}</p>
          )}
        </div>

        <InputField
          label="Due Date"
          name="dueDate"
          type="date"
          register={register}
          error={errors.dueDate}
        />

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Type</label>
          <select className={SELECT_CLS} {...register("type")}>
            {ASSIGNMENT_VALUE_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSIGNMENT_VALUE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {errors.type?.message && (
            <p className="text-xs text-red-400">{errors.type.message}</p>
          )}
        </div>

        {watchedType === "other" && (
          <InputField
            label="Type label"
            name="otherTypeLabel"
            register={register}
            error={errors.otherTypeLabel}
          />
        )}

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Status</label>
          <select className={SELECT_CLS} {...register("status")}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          {errors.status?.message && (
            <p className="text-xs text-red-400">{errors.status.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Grading</label>
          <select
            className={SELECT_CLS}
            disabled={type === "update"}
            {...register("gradingMode")}
          >
            <option value="gradebook">Add to Gradebook</option>
            <option value="standalone">Standalone (not in Gradebook)</option>
          </select>
          {type === "update" && (
            // Locked post-creation — ASSIGNMENTS_FEATURE_SPEC.md §4.5/§3
            // decision 21: standalone -> gradebook is one-way and only
            // happens via the dedicated "Convert to Gradebook" action on the
            // assignment detail page, which retroactively rescales every
            // already-graded student's result against the target column.
            // Allowing a free edit here would silently corrupt that math
            // instead of going through it.
            <p className="text-xs text-gray-400">
              Use "Convert to Gradebook" on the assignment page to change this.
            </p>
          )}
          {errors.gradingMode?.message && (
            <p className="text-xs text-red-400">{errors.gradingMode.message}</p>
          )}
        </div>

        {watchedGradingMode === "gradebook" && (
          <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className={LABEL_CLS}>Gradebook column</label>
            <select
              className={SELECT_CLS}
              disabled={type === "update" || !gradebookId}
              {...register("gradebookColumnId")}
            >
              <option value="">
                {gradebookId
                  ? gradebookColumns.length
                    ? "Select a column"
                    : "No columns yet for this class/subject/term"
                  : "Select term, subject, and class first"}
              </option>
              {gradebookColumns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} (/{c.maxScore})
                </option>
              ))}
            </select>
            {errors.gradebookColumnId?.message && (
              <p className="text-xs text-red-400">
                {errors.gradebookColumnId.message}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Rubric (optional)</label>
          <select className={SELECT_CLS} {...register("rubricId")}>
            <option value="">
              {rubrics.length ? "None" : "No rubrics available yet"}
            </option>
            {rubrics.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <label className={LABEL_CLS}>Attachment (optional)</label>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
              {attachment ? "Replace file" : "Upload file"}
              <input
                type="file"
                accept=".pdf,.docx,.pptx,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setAttachmentError(null);
                  setAttachmentLoading(true);
                  try {
                    setAttachment(await processDocumentUpload(file));
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
            {attachment && (
              <>
                <span className="text-xs text-gray-500 dark:text-gray-300">
                  {attachment.fileName} ({Math.round(attachment.size / 1024)} KB)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachmentError(null);
                    setAttachment(null);
                  }}
                  className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700"
                >
                  Remove
                </button>
              </>
            )}
          </div>
          {attachmentLoading && (
            <p className="text-xs text-gray-400">Processing file…</p>
          )}
          {attachmentError && (
            <p className="text-xs text-red-400">{attachmentError}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full">
          <label className={LABEL_CLS}>Description (optional)</label>
          <textarea
            {...register("description")}
            rows={4}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          {errors.description?.message && (
            <p className="text-xs text-red-400">{errors.description.message}</p>
          )}
        </div>
      </div>

      {submitError && <p className="text-xs text-red-400">{submitError}</p>}

      <button
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
        disabled={isSubmitting || attachmentLoading}
      >
        {isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default AssignmentForm;
