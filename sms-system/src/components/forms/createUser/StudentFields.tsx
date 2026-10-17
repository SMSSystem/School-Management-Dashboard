import ExtraClassesField, { type ExtraClassesValue } from "@/components/forms/ExtraClassesField";
import type { ClassDocument } from "@/types/institution";
import type { Role } from "@/types/people";
import { FieldError } from "./FieldError";
import type { CreateUserErrors, CreateUserRegister } from "./formTypes";
import { inputClass, labelClass, optionalClass, selectClass } from "./styles";

// A student's classes (home class and additional ones), date of birth, student ID and gender.
export function StudentFields({
  register,
  errors,
  selectedRole,
  classes,
  institutionIdValue,
  homeClassIdValue,
  extras,
  onExtrasChange,
}: {
  register: CreateUserRegister;
  errors: CreateUserErrors;
  selectedRole: Role;
  classes: (ClassDocument & { id: string })[];
  institutionIdValue: string;
  homeClassIdValue: string;
  extras: ExtraClassesValue;
  onExtrasChange: (value: ExtraClassesValue) => void;
}) {
  return (
    <>
      {selectedRole === "student" && classes.length > 0 && (
        <label className={labelClass}>
          <span className="flex items-center gap-1">
            Class{" "}
            <span className={optionalClass}>(optional)</span>
          </span>
          <select
            id="tour-create-user-class"
            {...register("classId")}
            className={selectClass}
          >
            <option value="">No class assigned</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <FieldError message={errors.classId?.message} />
        </label>
      )}

      {selectedRole === "student" && classes.length > 0 && institutionIdValue && (
        <div className="md:col-span-2">
          <ExtraClassesField
            institutionId={institutionIdValue}
            classes={classes}
            homeClassId={homeClassIdValue}
            value={{ ...extras, extraClassIds: extras.extraClassIds.filter((id) => id !== homeClassIdValue) }}
            onChange={onExtrasChange}
          />
        </div>
      )}

      {selectedRole === "student" && (
        <label className={labelClass}>
          Date of birth
          <input
            id="tour-create-user-dob"
            {...register("dateOfBirth")}
            aria-invalid={Boolean(errors.dateOfBirth)}
            type="date"
            className={inputClass}
          />
          <FieldError message={errors.dateOfBirth?.message} />
        </label>
      )}

      {selectedRole === "student" && (
        <label className={labelClass}>
          <span>
            Student ID{" "}
            <span className={optionalClass}>(optional)</span>
          </span>
          <input
            id="tour-create-user-student-id"
            {...register("institutionStudentId")}
            aria-invalid={Boolean(errors.institutionStudentId)}
            autoComplete="off"
            maxLength={50}
            className={inputClass}
          />
          <FieldError message={errors.institutionStudentId?.message} />
        </label>
      )}

      {selectedRole === "student" && (
        <label className={labelClass}>
          Gender
          <select
            id="tour-create-user-gender"
            {...register("gender")}
            aria-invalid={Boolean(errors.gender)}
            className={inputClass}
          >
            <option value="">Select gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          <FieldError message={errors.gender?.message} />
        </label>
      )}
    </>
  );
}
