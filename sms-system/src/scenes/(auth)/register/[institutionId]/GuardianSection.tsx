import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { RegistrationFormValues } from "@/lib/registrationFormLogic";
import GuardianFields from "./GuardianFields";

// The tick box that adds a parent's details to the registration, and the details once it is ticked. Used for the
// mother and for the father.
export default function GuardianSection({
  prefix,
  title,
  included,
  register,
  errors,
}: {
  prefix: "mother" | "father";
  title: string;
  included: boolean;
  register: UseFormRegister<RegistrationFormValues>;
  errors: FieldErrors<RegistrationFormValues>;
}) {
  return (
    <section>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          {...register(prefix === "mother" ? "includeMother" : "includeFather")}
          className="accent-sky-500 w-4 h-4"
        />
        <span className="text-sm font-semibold text-gray-900">{title}</span>
      </label>
      {included && (
        <GuardianFields prefix={prefix} register={register} errors={errors} />
      )}
    </section>
  );
}
