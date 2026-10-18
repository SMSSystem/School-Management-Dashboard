import type { FieldErrors, UseFormRegister } from "react-hook-form";
import InputField from "../../InputField";
import { ASSIGNMENT_VALUE_TYPE_LABELS, ASSIGNMENT_VALUE_TYPES } from "@/types/assessment";
import type { AssignmentFormValues } from "@/lib/assignmentFormLogic";
import { LABEL_CLS, SELECT_CLS } from "./styles";

// The kind of assignment and whether it is a draft or published.
export function AssignmentTypeFields({
  register,
  errors,
  watchedType,
}: {
  register: UseFormRegister<AssignmentFormValues>;
  errors: FieldErrors<AssignmentFormValues>;
  watchedType: AssignmentFormValues["type"];
}) {
  return (
    <>
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
    </>
  );
}
