import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { AssignmentFormValues } from "@/lib/assignmentFormLogic";
import { LABEL_CLS } from "./styles";

// The optional description.
export function DescriptionField({
  register,
  errors,
}: {
  register: UseFormRegister<AssignmentFormValues>;
  errors: FieldErrors<AssignmentFormValues>;
}) {
  return (
    <>
    <div className="flex flex-col gap-2 w-full">
      <label className={LABEL_CLS}>Description (optional)</label>
      <textarea
        {...register("description")}
        rows={4}
        className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />
      {errors.description?.message && (
        <p className="text-xs text-red-400">{errors.description.message}</p>
      )}
    </div>
    </>
  );
}
