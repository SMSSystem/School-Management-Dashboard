import type { FieldErrors, FieldValues, Path, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { LABEL_CLS, SELECT_CLS } from "./assignment/styles";
import { ROOMY_FIELD_CLS, ROOMY_INPUT_CLS, ROOMY_LABEL_CLS, type FieldVariant } from "./exam/examFormStyles";

type Named = { id: string; name: string };
type ScopeValues = Partial<Record<"termId" | "subjectId" | "classId" | "teacherId", string | undefined>>;

// A select's value from the form's values: controlled only when the form passes them (both forms do), and left to
// react-hook-form otherwise.
function shown(values: ScopeValues | undefined, name: keyof ScopeValues): { value?: string } {
  return values ? { value: values[name] ?? "" } : {};
}

const BOX_CLS = "flex flex-col gap-2 w-full md:w-1/4";

type Props<T extends FieldValues> = {
  register: UseFormRegister<T>;
  setValue: UseFormSetValue<T>;
  errors: FieldErrors<T>;
  terms: readonly Named[];
  subjects: readonly Named[];
  /** The classes offered for the chosen subject (classOptionsFor in lib/assignmentFormLogic.ts). */
  classOptions: readonly Named[];
  /** The chosen subject's teachers (teacherOptionsFor in lib/assignmentFormLogic.ts). */
  teacherOptions: readonly Named[];
  /** A teacher signed in: the teacher is themselves, shown locked, and is not cleared when the subject changes. */
  isTeacherRole: boolean;
  lockedTeacherName: string;
  /** "roomy" is the look of the Edit Student Details form (the exam form); the default is the assignment form's. */
  variant?: FieldVariant;
  /**
   * The form's current values (its watch()). Each select shows its value from these, so a value set before its option
   * list loaded still shows once the list arrives; react-hook-form alone sets a select only once, when it registers.
   */
  values?: ScopeValues;
};

// The Term, Subject, Class and Teacher fields that the Add/Edit Exam form and the Add/Edit Assignment form share.
// Choosing a subject clears the class, and the teacher too unless a teacher is the one signed in. The forms keep
// their own schemas, option lists, submit handlers and the fields around these (the assignment's title and due date,
// the exam's date, time, duration and room).
export default function TermSubjectClassTeacherFields<T extends FieldValues>({
  register,
  setValue,
  errors,
  terms,
  subjects,
  classOptions,
  teacherOptions,
  isTeacherRole,
  lockedTeacherName,
  variant = "default",
  values,
}: Props<T>) {
  const roomy = variant === "roomy";
  const box = roomy ? ROOMY_FIELD_CLS : BOX_CLS;
  const label = roomy ? ROOMY_LABEL_CLS : LABEL_CLS;
  const select = roomy ? ROOMY_INPUT_CLS : SELECT_CLS;
  const set = (name: string, value: string) => setValue(name as Path<T>, value as never);
  const error = (name: string): string | undefined =>
    (errors[name as keyof typeof errors] as { message?: unknown } | undefined)?.message?.toString();

  return (
    <>
      <div className={box}>
        <label htmlFor={roomy ? "termId" : undefined} className={label}>Term</label>
        <select id={roomy ? "termId" : undefined} className={select} {...register("termId" as Path<T>)} {...shown(values, "termId")}>
          <option value="">Select a term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {error("termId") && <p className="text-xs text-red-400">{error("termId")}</p>}
      </div>

      <div className={box}>
        <label htmlFor={roomy ? "subjectId" : undefined} className={label}>Subject</label>
        <select
          id={roomy ? "subjectId" : undefined}
          className={select}
          {...register("subjectId" as Path<T>)}
          {...shown(values, "subjectId")}
          onChange={(e) => {
            set("subjectId", e.target.value);
            set("classId", "");
            if (!isTeacherRole) set("teacherId", "");
          }}
        >
          <option value="">Select a subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {error("subjectId") && <p className="text-xs text-red-400">{error("subjectId")}</p>}
      </div>

      <div className={box}>
        <label htmlFor={roomy ? "classId" : undefined} className={label}>Class</label>
        <select id={roomy ? "classId" : undefined} className={select} {...register("classId" as Path<T>)} {...shown(values, "classId")}>
          <option value="">Select a class</option>
          {classOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {error("classId") && <p className="text-xs text-red-400">{error("classId")}</p>}
      </div>

      <div className={box}>
        <label htmlFor={roomy ? "teacherId" : undefined} className={label}>Teacher</label>
        {isTeacherRole ? (
          <input
            value={lockedTeacherName}
            disabled
            readOnly
            id={roomy ? "teacherId" : undefined}
            className={roomy ? ROOMY_INPUT_CLS : "ring-[1.5px] ring-gray-200 p-2 rounded-md text-sm w-full bg-gray-100 text-gray-500 dark:ring-gray-700 dark:bg-gray-800 dark:text-gray-400"}
          />
        ) : (
          <select id={roomy ? "teacherId" : undefined} className={select} {...register("teacherId" as Path<T>)} {...shown(values, "teacherId")}>
            <option value="">Select a teacher</option>
            {teacherOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {error("teacherId") && <p className="text-xs text-red-400">{error("teacherId")}</p>}
      </div>
    </>
  );
}
