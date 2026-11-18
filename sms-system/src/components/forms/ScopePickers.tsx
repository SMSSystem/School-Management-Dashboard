import { useMemo } from "react";
import type {
  FieldErrors,
  FieldValues,
  Path,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import { sortByName, sortByNameNatural } from "@/lib/sortByName";

type Named = { id: string; name: string };
type StudentOption = { uid: string; name: string; classId?: string };

const SELECT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";
const LABEL_CLS = "text-xs text-gray-500 dark:text-gray-300";
const BOX_CLS = "flex flex-col gap-2 w-full md:w-1/4";

type Props<T extends FieldValues> = {
  register: UseFormRegister<T>;
  setValue: UseFormSetValue<T>;
  errors: FieldErrors<T>;
  /** The record being edited (its subjectId, studentId, termId and classId are the starting values), or nothing. */
  data?: Record<string, string | number | readonly string[] | undefined>;
  subjects: readonly Named[];
  terms: readonly Named[];
  classes: readonly Named[];
  /** Every student of the institution, to look a chosen one up. */
  students: readonly StudentOption[];
  /** The students the chosen subject applies to (all of them for an institution-wide subject). */
  studentOptions: readonly StudentOption[];
  /** True when the chosen student has no home class, so the class has to be picked by hand. */
  studentHasNoClass: boolean;
  /** The subject was changed; the form keeps the whole subject to filter the student list. */
  onSubjectChange: (subjectId: string) => void;
  /** A student was chosen (true: they have a home class) or the choice was reset (false). */
  onStudentChosen: (hasClass: boolean) => void;
};

// The Subject, Student, (class) and Term pickers that the Add/Edit Result and Add/Edit Feedback Comment forms
// share. Picking a student fills the hidden classId with their home class; a student with none shows a class
// picker. Picking a subject clears the student and class. The two forms keep their own schema, submit and
// audit entry; they pass in what they loaded and read the choice back from react-hook-form.
export default function ScopePickers<T extends FieldValues>({
  register,
  setValue,
  errors,
  data,
  subjects,
  terms,
  classes,
  students,
  studentOptions,
  studentHasNoClass,
  onSubjectChange,
  onStudentChosen,
}: Props<T>) {
  // Options in alphabetical order whatever order they were loaded in: people plainly, subjects and classes naturally
  // ("Grade 2" before "Grade 10").
  const sortedSubjects = useMemo(
    () => sortByNameNatural([...subjects], (s) => s.name),
    [subjects],
  );
  const sortedStudents = useMemo(
    () => sortByName([...studentOptions], (s) => s.name),
    [studentOptions],
  );
  const sortedClasses = useMemo(
    () => sortByNameNatural([...classes], (c) => c.name),
    [classes],
  );

  const defaults = {
    subjectId: data?.subjectId as string | undefined,
    studentId: data?.studentId as string | undefined,
    termId: data?.termId as string | undefined,
    classId: data?.classId as string | undefined,
  };
  const set = (name: string, value: string) =>
    setValue(name as Path<T>, value as never);
  const error = (name: string): string | undefined =>
    (
      errors[name as keyof typeof errors] as { message?: unknown } | undefined
    )?.message?.toString();

  return (
    <>
      {/* Subject */}
      <div className={BOX_CLS}>
        <label className={LABEL_CLS}>Subject</label>
        <select
          className={SELECT_CLS}
          {...register("subjectId" as Path<T>)}
          defaultValue={defaults.subjectId}
          onChange={(e) => {
            set("subjectId", e.target.value);
            onSubjectChange(e.target.value);
            set("studentId", "");
            set("classId", "");
            onStudentChosen(true); // no student is chosen any more, so there is nothing to warn about
          }}
        >
          <option value="">Select a subject</option>
          {sortedSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {error("subjectId") && (
          <p className="text-xs text-red-400">{error("subjectId")}</p>
        )}
      </div>

      {/* Student */}
      <div className={BOX_CLS}>
        <label className={LABEL_CLS}>Student</label>
        <select
          className={SELECT_CLS}
          {...register("studentId" as Path<T>)}
          defaultValue={defaults.studentId}
          onChange={(e) => {
            set("studentId", e.target.value);
            const student = students.find((s) => s.uid === e.target.value);
            if (student) {
              if (student.classId) {
                set("classId", student.classId);
                onStudentChosen(true);
              } else {
                set("classId", "");
                onStudentChosen(false);
              }
            }
          }}
        >
          <option value="">Select a student</option>
          {sortedStudents.map((s) => (
            <option key={s.uid} value={s.uid}>
              {s.name}
            </option>
          ))}
        </select>
        {error("studentId") && (
          <p className="text-xs text-red-400">{error("studentId")}</p>
        )}
      </div>

      {/* classId — hidden, auto-derived from student selection */}
      <input
        type="hidden"
        {...register("classId" as Path<T>)}
        defaultValue={defaults.classId}
      />
      {studentHasNoClass && (
        <div className={BOX_CLS}>
          <label className={LABEL_CLS}>
            Class{" "}
            <span className="text-orange-400">
              (student has no assigned class — select manually)
            </span>
          </label>
          <select
            className={SELECT_CLS}
            onChange={(e) => set("classId", e.target.value)}
          >
            <option value="">Select a class</option>
            {sortedClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {error("classId") && (
            <p className="text-xs text-red-400">{error("classId")}</p>
          )}
        </div>
      )}

      {/* Term */}
      <div className={BOX_CLS}>
        <label className={LABEL_CLS}>Term</label>
        <select
          className={SELECT_CLS}
          {...register("termId" as Path<T>)}
          defaultValue={defaults.termId}
        >
          <option value="">Select a term</option>
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {error("termId") && (
          <p className="text-xs text-red-400">{error("termId")}</p>
        )}
      </div>
    </>
  );
}
