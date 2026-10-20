import type { FieldErrors, UseFormRegister } from "react-hook-form";
import InputField from "../../InputField";
import type { SubjectFormRecord, SubjectFormValues } from "@/lib/subjectFormLogic";

// The subject's name and description.
export default function SubjectBasicFields({
  data,
  register,
  errors,
}: {
  data: SubjectFormRecord | undefined;
  register: UseFormRegister<SubjectFormValues>;
  errors: FieldErrors<SubjectFormValues>;
}) {
  return (
    <>
      <InputField
        label="Subject Name"
        name="name"
        defaultValue={data?.name}
        register={register}
        error={errors.name}
      />

      <div className="flex flex-col gap-2 w-full">
        <label className="text-xs text-gray-500 dark:text-gray-300">Description</label>
        <textarea
          {...register("description")}
          defaultValue={data?.description}
          rows={3}
          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        {errors.description?.message && (
          <p className="text-xs text-red-400">{errors.description.message.toString()}</p>
        )}
      </div>
    </>
  );
}
