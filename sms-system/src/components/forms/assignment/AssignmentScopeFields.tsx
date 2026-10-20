import type { FieldErrors, UseFormRegister, UseFormSetValue } from "react-hook-form";
import InputField from "../../InputField";
import type { AssignmentFormValues } from "@/lib/assignmentFormLogic";
import TermSubjectClassTeacherFields from "../TermSubjectClassTeacherFields";

// What the assignment is about: its title, term, subject, class, teacher (locked for a teacher) and due date.
export function AssignmentScopeFields({
  register,
  errors,
  setValue,
  terms,
  subjects,
  classOptions,
  teacherOptions,
  isTeacherRole,
  lockedTeacherName,
}: {
  register: UseFormRegister<AssignmentFormValues>;
  errors: FieldErrors<AssignmentFormValues>;
  setValue: UseFormSetValue<AssignmentFormValues>;
  terms: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  classOptions: { id: string; name: string }[];
  teacherOptions: { id: string; name: string }[];
  isTeacherRole: boolean;
  lockedTeacherName: string;
}) {
  return (
    <>
    <InputField
      label="Title"
      name="title"
      register={register}
      error={errors.title}
    />

    <TermSubjectClassTeacherFields
      register={register}
      setValue={setValue}
      errors={errors}
      terms={terms}
      subjects={subjects}
      classOptions={classOptions}
      teacherOptions={teacherOptions}
      isTeacherRole={isTeacherRole}
      lockedTeacherName={lockedTeacherName}
    />

    <InputField
      label="Due Date"
      name="dueDate"
      type="date"
      register={register}
      error={errors.dueDate}
    />
    </>
  );
}
