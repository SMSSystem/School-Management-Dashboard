import { z } from "@/lib/zod";
import { deleteField, Timestamp } from "firebase/firestore";
import { ASSIGNMENT_VALUE_TYPES } from "@/types/assessment";
import type { ProcessedDocument } from "@/lib/documentUpload";
import type { AssignmentFile } from "@/lib/assignmentFile";
import { assignmentGradebookId } from "@/lib/assignmentDetailLogic";

// The assignment form's rules that need no screen or database (components/forms/AssignmentForm): the form's
// validation, the attachment it starts with, the gradebook it points at, which classes and teachers it offers
// for a subject, who the assignment's teacher is, and the document a save writes.

export const schema = z
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

/** What the form's fields hold, and what they hold once validated. */
export type AssignmentFormValues = z.input<typeof schema>;
export type AssignmentFormOutput = z.output<typeof schema>;

// Who can be an assignment's teacher: an institution admin can also be a subject's teacher.
export type AssignmentTeacherRole = "regular_teacher" | "senior_teacher" | "institution_admin";

/** The assignment being edited, as the list hands it over (loosely typed, like every form's `data`). */
export type AssignmentFormRecord = Partial<
  Record<string, string | number | readonly string[] | undefined>
>;

export type TeacherMeta = { departmentId?: string; role?: AssignmentTeacherRole };

type SubjectScope = { classScope: string; classIds: string[]; name?: string; teacherIds: string[]; teacherNames: string[] };

/**
 * The attachment as stored: embedded (attachmentDataUrl) or, for a file over 500KB, only its key in the
 * Realtime Database (attachmentBlobKey) — the body is not loaded for editing.
 */
export function initialAttachment(data: AssignmentFormRecord | undefined): AssignmentFile | null {
  const meta = {
    fileName: (data?.attachmentFileName as string | undefined) ?? "attachment",
    mimeType:
      (data?.attachmentMimeType as ProcessedDocument["mimeType"] | undefined) ??
      "application/pdf",
    size: (data?.attachmentSize as number | undefined) ?? 0,
  };
  const blobKey = data?.attachmentBlobKey as string | undefined;
  if (blobKey) return { dataUrl: "", blobKey, ...meta };
  const dataUrl = data?.attachmentDataUrl as string | undefined;
  if (!dataUrl) return null;
  return { dataUrl, ...meta };
}

/** The gradebook the chosen class, subject and term share (the same id the Gradebook page uses), or null until all three are chosen. */
export function gradebookIdFor(classId: string, subjectId: string, termId: string): string | null {
  return classId && subjectId && termId ? assignmentGradebookId({ classId, subjectId, termId }) : null;
}

/** The classes offered for the chosen subject: all of them for an institution-wide subject or one with no class list. */
export function classOptionsFor<C extends { id: string }>(selectedSubject: SubjectScope | undefined, classes: C[]): C[] {
  return !selectedSubject
    ? classes
    : selectedSubject.classScope === "institution" ||
        selectedSubject.classIds.length === 0
      ? classes
      : classes.filter((c) => selectedSubject.classIds.includes(c.id));
}

/** The chosen subject's teachers, with their ids standing in for a missing name. */
export function teacherOptionsFor(selectedSubject: SubjectScope | undefined): { id: string; name: string }[] {
  return selectedSubject
    ? selectedSubject.teacherIds.map((id, i) => ({
        id,
        name: selectedSubject.teacherNames[i] ?? id,
      }))
    : [];
}

/**
 * Who the assignment's teacher is, with their department and role. A teacher is always the author; an admin
 * picks one. The department comes from the author's own profile, else the teachers' list, else (on update) the
 * stored one; the role from the signed-in teacher, else the list, else (on update) the stored one. A missing
 * role means the form refuses to save.
 */
export function resolveTeacher({
  isTeacherRole,
  role,
  lockedTeacherId,
  lockedTeacherName,
  formTeacherId,
  teacherOptions,
  teacherMetaById,
  userUid,
  myDepartmentId,
  type,
  data,
}: {
  isTeacherRole: boolean;
  role: string | null;
  lockedTeacherId: string;
  lockedTeacherName: string;
  formTeacherId: string | undefined;
  teacherOptions: { id: string; name: string }[];
  teacherMetaById: Record<string, TeacherMeta>;
  userUid: string | undefined;
  myDepartmentId: string | null | undefined;
  type: "create" | "update";
  data: AssignmentFormRecord | undefined;
}) {
  const teacherId = isTeacherRole
    ? lockedTeacherId
    : String(formTeacherId ?? "");
  const teacherName = isTeacherRole
    ? lockedTeacherName
    : (teacherOptions.find((t) => t.id === teacherId)?.name ?? "");
  const teacherMeta = teacherMetaById[teacherId];
  // When the signed-in teacher is the author, their own users doc is the
  // source: it's always readable by its owner. The all-teachers query above
  // is rejected by the `users` read rule for any teacher-role caller
  // (ISSUES_AND_GAPS.md #37), so teacherMetaById stays empty for them and a
  // teacher's own assignment would otherwise never get a departmentId —
  // even a teacher who has one.
  const ownDepartmentId =
    teacherId === userUid ? (myDepartmentId ?? undefined) : undefined;
  const departmentId =
    ownDepartmentId ??
    teacherMeta?.departmentId ??
    (type === "update"
      ? (data?.departmentId as string | undefined)
      : undefined);
  const teacherRole = isTeacherRole
    ? (role as "regular_teacher" | "senior_teacher")
    : (teacherMeta?.role ??
      (type === "update"
        ? (data?.teacherRole as AssignmentTeacherRole | undefined)
        : undefined));
  return { teacherId, teacherName, departmentId, teacherRole };
}

/** The document a save writes (without the attachment fields, which are added at write time, and the create-only fields). */
export function buildAssignmentPayload({
  institutionId,
  formData,
  type,
  data,
  termName: liveTermName,
  subjectName: liveSubjectName,
  className: liveClassName,
  teacher,
}: {
  institutionId: string;
  formData: AssignmentFormOutput;
  type: "create" | "update";
  data: AssignmentFormRecord | undefined;
  termName: string | undefined;
  subjectName: string | undefined;
  className: string | undefined;
  teacher: { teacherId: string; teacherName: string; departmentId: string | undefined; teacherRole: AssignmentTeacherRole };
}) {
  const { teacherId, teacherName, departmentId, teacherRole } = teacher;

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
  // The attachment fields are added at write time (assignmentAttachmentFields),
  // because a large file's key only exists once it has been uploaded.

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
    liveTermName ?? (type === "update" ? (data?.termName as string | undefined) : undefined) ?? "";
  const subjectName =
    liveSubjectName ?? (type === "update" ? (data?.subjectName as string | undefined) : undefined) ?? "";
  const className =
    liveClassName ?? (type === "update" ? (data?.className as string | undefined) : undefined) ?? "";

  return {
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
    // (types/assessment.ts) and ASSIGNMENTS_FEATURE_SPEC.md §4.1/§9.1.
    dueDateTimestamp: Timestamp.fromDate(new Date(formData.dueDate)),
    ...(formData.description && { description: formData.description }),
    title: formData.title,
    type: formData.type,
    status: formData.status,
    gradingMode,
    ...optionalFields,
  };
}
