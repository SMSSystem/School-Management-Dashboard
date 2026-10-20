import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { RegistrationDirectory, RegistrationFormValues } from "@/lib/registrationFormLogic";
import FieldError from "./FieldError";
import { inputClass, labelClass } from "./fieldHelpers";

// Programme picker (§6, custom-mode only) — replaces the silent
// directory.activeAcademicYearId default, which assumed exactly
// one active year.
export default function ProgrammeField({
  directory,
  register,
  errors,
}: {
  directory: RegistrationDirectory;
  register: UseFormRegister<RegistrationFormValues>;
  errors: FieldErrors<RegistrationFormValues>;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 mb-3">
        Programme
      </h2>
      <label className={labelClass}>
        Which programme are you applying for?
        <select {...register("academicYearId")} className={inputClass}>
          <option value="">Select a programme</option>
          {directory.openTimeBlocks?.map((b) => (
            <option key={b.academicYearId} value={b.academicYearId}>
              {b.name}
            </option>
          ))}
        </select>
        <FieldError message={errors.academicYearId?.message} />
      </label>
    </section>
  );
}
