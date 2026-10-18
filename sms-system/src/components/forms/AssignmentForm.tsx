import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import NoDepartmentNotice from "../NoDepartmentNotice";
import { useMyDepartment } from "@/hooks/useMyDepartment";
import { ASSIGNMENT_VALUE_TYPES } from "@/lib/firebase";
import { largeUploadPolicy } from "@/lib/blobStore";
import type { AssignmentFile } from "@/lib/assignmentFile";
import { useAuth } from "@/lib/AuthContext";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import { useAssignmentFormOptions } from "@/hooks/useAssignmentFormOptions";
import {
  buildAssignmentPayload,
  classOptionsFor,
  gradebookIdFor,
  initialAttachment,
  resolveTeacher,
  schema,
  teacherOptionsFor,
  type AssignmentFormRecord,
} from "@/lib/assignmentFormLogic";
import { saveAssignment } from "@/lib/assignmentFormSave";
import { AssignmentScopeFields } from "./assignment/AssignmentScopeFields";
import { AssignmentTypeFields } from "./assignment/AssignmentTypeFields";
import { AssignmentGradingFields } from "./assignment/AssignmentGradingFields";
import { AttachmentField } from "./assignment/AttachmentField";
import { DescriptionField } from "./assignment/DescriptionField";

const AssignmentForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: AssignmentFormRecord;
  onClose?: () => void;
}) => {
  const { user, role, institutionId } = useAuth();
  const { departmentId: myDepartmentId } = useMyDepartment();
  const isTeacherRole = role === "senior_teacher" || role === "regular_teacher";
  // Teachers and institution admins may attach up to 5MB (kept in the Realtime
  // Database); every other role keeps the 500KB limit.
  const uploadPolicy = largeUploadPolicy(role);

  const { data: rawTerms = [] } = useInstitutionTerms();
  const terms = useMemo(
    () => [...rawTerms].sort((a, b) => a.name.localeCompare(b.name)),
    [rawTerms],
  );
  const { data: subjects = [] } = useInstitutionSubjects();
  const { data: classes = [] } = useInstitutionClasses();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The attachment as stored: embedded (attachmentDataUrl) or, for a file over
  // 500KB, only its key in the Realtime Database (attachmentBlobKey) — the body
  // is not loaded for editing. attachmentChanged turns true once a file is
  // chosen or removed here; until then the stored file is kept as it is.
  const [attachment, setAttachment] = useState<AssignmentFile | null>(() => initialAttachment(data));
  const [attachmentChanged, setAttachmentChanged] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

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

  // The gradebook the chosen class, subject and term share (the same id list/gradebook/index.tsx uses).
  const gradebookId = gradebookIdFor(watchedClassId, watchedSubjectId, watchedTermId);
  const { rubrics, gradebookColumns, teacherMetaById, ownName } = useAssignmentFormOptions({
    institutionId,
    user,
    isTeacherRole,
    type,
    gradebookId,
    watchedGradingMode,
  });

  // Locked teacher display: own name on create, whoever's already on the
  // document (not necessarily self) on update — never silently reassigns.
  const lockedTeacherId =
    type === "update" && data?.teacherId
      ? String(data.teacherId)
      : (user?.uid ?? "");
  const lockedTeacherName =
    type === "update" && data?.teacherName ? String(data.teacherName) : ownName;

  useEffect(() => {
    if (isTeacherRole && lockedTeacherId) {
      setValue("teacherId", lockedTeacherId, { shouldValidate: true });
    }
  }, [isTeacherRole, lockedTeacherId, setValue]);

  const classOptions = classOptionsFor(selectedSubject, classes);

  const teacherOptions = teacherOptionsFor(selectedSubject);

  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    if (!institutionId) return;
    try {
      const term = terms.find((t) => t.id === formData.termId);
      const cls = classes.find((c) => c.id === formData.classId);
      const { teacherId, teacherName, departmentId, teacherRole } = resolveTeacher({
        isTeacherRole,
        role,
        lockedTeacherId,
        lockedTeacherName,
        formTeacherId: formData.teacherId,
        teacherOptions,
        teacherMetaById,
        userUid: user?.uid,
        myDepartmentId,
        type,
        data,
      });
      if (!teacherRole) {
        setSubmitError("Could not determine the selected teacher's role — try again.");
        return;
      }

      const payload = buildAssignmentPayload({
        institutionId,
        formData,
        type,
        data,
        termName: term?.name,
        subjectName: selectedSubject?.name,
        className: cls?.name,
        teacher: { teacherId, teacherName, departmentId, teacherRole },
      });

      const updateId = type === "update" ? data?.id : undefined;
      if (type === "update" && typeof updateId !== "string") {
        console.log(
          "AssignmentForm update: no string ID (mock mode)",
          formData,
        );
        return;
      }

      await saveAssignment({
        institutionId,
        uid: user?.uid ?? "",
        role,
        type,
        data,
        updateId,
        payload,
        attachment,
        attachmentChanged,
        setUploading,
      });
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
      <NoDepartmentNotice />
      <div className="flex justify-between flex-wrap gap-4">
        <AssignmentScopeFields
          register={register}
          errors={errors}
          setValue={setValue}
          terms={terms}
          subjects={subjects}
          classOptions={classOptions}
          teacherOptions={teacherOptions}
          isTeacherRole={isTeacherRole}
          lockedTeacherName={lockedTeacherName}
        />
        <AssignmentTypeFields
          register={register}
          errors={errors}
          watchedType={watchedType}
        />
        <AssignmentGradingFields
          register={register}
          errors={errors}
          type={type}
          watchedGradingMode={watchedGradingMode}
          gradebookId={gradebookId}
          gradebookColumns={gradebookColumns}
          rubrics={rubrics}
        />
        <AttachmentField
          attachment={attachment}
          setAttachment={setAttachment}
          setAttachmentChanged={setAttachmentChanged}
          attachmentLoading={attachmentLoading}
          setAttachmentLoading={setAttachmentLoading}
          attachmentError={attachmentError}
          setAttachmentError={setAttachmentError}
          uploadPolicy={uploadPolicy}
        />
        <DescriptionField
          register={register}
          errors={errors}
        />
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

export default AssignmentForm;
