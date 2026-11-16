import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMissingRecordNotice } from "./MissingRecordNotice";
import NoDepartmentNotice from "../NoDepartmentNotice";
import { useMyDepartment } from "@/hooks/useMyDepartment";
import { largeUploadPolicy } from "@/lib/blobStore";
import { useAuth } from "@/lib/AuthContext";
import { useAssignmentFormLists } from "@/hooks/useAssignmentFormLists";
import { useAssignmentFormOptions } from "@/hooks/useAssignmentFormOptions";
import { useLockedTeacher } from "@/hooks/useLockedTeacher";
import {
  assignmentDefaultValues,
  classOptionsFor,
  gradebookIdFor,
  schema,
  teacherOptionsFor,
  type AssignmentFormRecord,
} from "@/lib/assignmentFormLogic";
import { useAssignmentSubmit } from "@/hooks/useAssignmentSubmit";
import { AssignmentScopeFields } from "./assignment/AssignmentScopeFields";
import { AssignmentTypeFields } from "./assignment/AssignmentTypeFields";
import { AssignmentGradingFields } from "./assignment/AssignmentGradingFields";
import { AttachmentField } from "./assignment/AttachmentField";
import { DescriptionField } from "./assignment/DescriptionField";
import { AssignmentFormFooter } from "./assignment/AssignmentFormFooter";
import { useAssignmentAttachment } from "./assignment/useAssignmentAttachment";

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

  const { terms, subjects, classes } = useAssignmentFormLists();
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The attachment as stored, and whether it was changed here (useAssignmentAttachment.ts).
  const {
    attachment,
    setAttachment,
    attachmentChanged,
    setAttachmentChanged,
    uploading,
    setUploading,
    attachmentLoading,
    setAttachmentLoading,
    attachmentError,
    setAttachmentError,
  } = useAssignmentAttachment(data);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    // The record's own values, or a new homework draft graded in the gradebook (assignmentFormLogic.ts).
    defaultValues: assignmentDefaultValues(data),
  });

  const watchedSubjectId = watch("subjectId");
  const watchedClassId = watch("classId");
  const watchedTermId = watch("termId");
  const watchedType = watch("type");
  const watchedGradingMode = watch("gradingMode");
  const selectedSubject = subjects.find((s) => s.id === watchedSubjectId);

  // The gradebook the chosen class, subject and term share (the same id list/gradebook/index.tsx uses).
  const gradebookId = gradebookIdFor(watchedClassId, watchedSubjectId, watchedTermId);
  const { rubrics, gradebookColumns, teacherMetaById } = useAssignmentFormOptions({
    institutionId,
    gradebookId,
    watchedGradingMode,
  });

  // Locked teacher display: own name on create, whoever's already on the
  // document (not necessarily self) on update — never silently reassigns.
  const { lockedTeacherId, lockedTeacherName } = useLockedTeacher({
    user,
    isTeacherRole,
    type,
    data,
    setTeacherId: (id) => setValue("teacherId", id, { shouldValidate: true }),
  });

  const classOptions = classOptionsFor(selectedSubject, classes);

  const teacherOptions = teacherOptionsFor(selectedSubject);

  const missingId = useMissingRecordNotice();
  const onSubmit = handleSubmit(
    useAssignmentSubmit({
      institutionId,
      user,
      role,
      type,
      data,
      isTeacherRole,
      lockedTeacherId,
      lockedTeacherName,
      teacherOptions,
      teacherMetaById,
      myDepartmentId,
      terms,
      classes,
      selectedSubject,
      attachment,
      attachmentChanged,
      setUploading,
      setSubmitError,
      showMissingId: () => {
        missingId.show();
      },
      // Closes only after the save: upload, then add or update, then removing a replaced file (assignmentFormSave.ts).
      onSaved: () => {
        onClose?.();
      },
    }),
  );

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

      <AssignmentFormFooter
        submitError={submitError}
        uploading={uploading}
        isSubmitting={isSubmitting}
        attachmentLoading={attachmentLoading}
        type={type}
        missingNotice={<>{missingId.notice}</>}
      />
    </form>
  );
};

export default AssignmentForm;
