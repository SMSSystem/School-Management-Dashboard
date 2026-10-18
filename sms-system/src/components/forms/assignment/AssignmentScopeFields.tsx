import type { FieldErrors, UseFormRegister, UseFormSetValue } from "react-hook-form";
import InputField from "../../InputField";
import type { AssignmentFormValues } from "@/lib/assignmentFormLogic";
import { LABEL_CLS, SELECT_CLS } from "./styles";

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
    </>
  );
}
