import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { RegistrationFormValues } from "@/lib/registrationFormLogic";
import FieldError from "./FieldError";
import { inputClass, labelClass, withAutoCapitalize, withPhoneFormat } from "./fieldHelpers";

export default function GuardianFields({
  prefix,
  register,
  errors,
}: {
  prefix: "mother" | "father";
  register: UseFormRegister<RegistrationFormValues>;
  errors: FieldErrors<RegistrationFormValues>;
}) {
  const err = errors[prefix];
  return (
    <div className="grid gap-4 sm:grid-cols-2 mt-3 pl-4 border-l-2 border-sky-100">
      <label className={labelClass}>
        Last name
        <input
          autoComplete="off"
          {...withAutoCapitalize(register(`${prefix}.lastName`))}
          className={inputClass}
        />
        <FieldError message={err?.lastName?.message} />
      </label>
      <label className={labelClass}>
        First name
        <input
          autoComplete="off"
          {...withAutoCapitalize(register(`${prefix}.firstName`))}
          className={inputClass}
        />
        <FieldError message={err?.firstName?.message} />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Address
        <input
          autoComplete="off"
          {...register(`${prefix}.address`)}
          className={inputClass}
        />
        <FieldError message={err?.address?.message} />
      </label>
      <label className={labelClass}>
        Contact number
        <input
          autoComplete="off"
          {...withPhoneFormat(register(`${prefix}.contact`))}
          className={inputClass}
        />
        <FieldError message={err?.contact?.message} />
      </label>
      <label className={labelClass}>
        Email
        <input
          type="email"
          autoComplete="off"
          {...register(`${prefix}.email`)}
          className={inputClass}
        />
        <FieldError message={err?.email?.message} />
      </label>
      <label className={labelClass}>
        Occupation
        <input
          autoComplete="off"
          {...register(`${prefix}.occupation`)}
          className={inputClass}
        />
        <FieldError message={err?.occupation?.message} />
      </label>
      <label className={labelClass}>
        <span>
          Employer <span className="font-normal text-gray-400">(optional)</span>
        </span>
        <input
          autoComplete="off"
          {...register(`${prefix}.work`)}
          className={inputClass}
        />
        <FieldError message={err?.work?.message} />
      </label>
    </div>
  );
}
