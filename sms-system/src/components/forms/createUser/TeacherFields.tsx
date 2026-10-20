import type { ClassDocument } from "@/types/institution";
import type { Role } from "@/types/people";
import { FieldError } from "./FieldError";
import type { CreateUserErrors, CreateUserRegister } from "./formTypes";
import { inputClass, labelClass, optionalClass, selectClass } from "./styles";

// A teacher's department and, for a senior teacher, the homeroom class, room and building.
export function TeacherFields({
  register,
  errors,
  selectedRole,
  departments,
  classes,
}: {
  register: CreateUserRegister;
  errors: CreateUserErrors;
  selectedRole: Role;
  departments: { id: string; name: string }[];
  classes: (ClassDocument & { id: string })[];
}) {
  return (
    <>
      {(selectedRole === "senior_teacher" ||
        selectedRole === "regular_teacher") &&
        departments.length > 0 && (
          <label className={labelClass}>
            <span className="flex items-center gap-1">
              Department{" "}
              <span className={optionalClass}>(required)</span>
            </span>
            <select
              id="tour-create-user-department"
              {...register("departmentId")}
              className={selectClass}
            >
              <option value="">Select a department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <FieldError message={errors.departmentId?.message} />
          </label>
        )}

      {selectedRole === "senior_teacher" && classes.length > 0 && (
        <label className={labelClass}>
          <span className="flex items-center gap-1">
            Homeroom Class{" "}
            <span className={optionalClass}>(optional)</span>
          </span>
          <select
            id="tour-create-user-assigned-class"
            {...register("assignedClassId")}
            className={selectClass}
          >
            <option value="">No class assigned</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <FieldError message={errors.assignedClassId?.message} />
        </label>
      )}

      {selectedRole === "senior_teacher" && classes.length > 0 && (
        <>
          <label className={labelClass}>
            Homeroom Room
            <input
              id="tour-create-user-homeroom-room"
              {...register("homeroomRoom")}
              aria-invalid={Boolean(errors.homeroomRoom)}
              autoComplete="off"
              className={inputClass}
            />
            <FieldError message={errors.homeroomRoom?.message} />
          </label>

          <label className={labelClass}>
            <span>
              Homeroom Building{" "}
              <span className={optionalClass}>(optional)</span>
            </span>
            <input
              id="tour-create-user-homeroom-building"
              {...register("homeroomBuilding")}
              aria-invalid={Boolean(errors.homeroomBuilding)}
              autoComplete="off"
              className={inputClass}
            />
            <FieldError message={errors.homeroomBuilding?.message} />
          </label>
        </>
      )}
    </>
  );
}
