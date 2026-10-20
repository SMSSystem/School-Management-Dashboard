import type { FormEventHandler } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { formatPhone, formatPhoneForDisplay } from "@/lib/phone";
import type { ContactFormValues, ProfileData } from "@/lib/profileLogic";
import Field from "./Field";
import { inputClassName } from "./styles";

// What goes inside the Contact Information card: the editable form for a super admin (name, phone and emergency
// contact, with a Save button once something changed), otherwise the same four values read-only.
const ContactInfoBody = ({
  canEditContactInfo,
  profile,
  register,
  errors,
  isDirty,
  isSubmitting,
  saveError,
  onSubmit,
  canonicalizePhone,
}: {
  canEditContactInfo: boolean;
  profile: ProfileData;
  register: UseFormRegister<ContactFormValues>;
  errors: FieldErrors<ContactFormValues>;
  isDirty: boolean;
  isSubmitting: boolean;
  saveError: string | null;
  onSubmit: FormEventHandler<HTMLFormElement>;
  canonicalizePhone: (value: string) => string;
}) => {
  const { onChange: onPhoneChange, onBlur: onPhoneBlur, ...phoneReg } = register("phone");

  return canEditContactInfo ? (
    <form onSubmit={onSubmit} noValidate>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Display name
          </span>
          <input
            type="text"
            autoComplete="off"
            className={inputClassName}
            {...register("name")}
          />
          {errors.name && (
            <span className="text-xs text-red-500 mt-0.5">
              {errors.name.message}
            </span>
          )}
        </div>
        <Field label="Email" value={profile.email} />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Phone
          </span>
          <input
            type="text"
            autoComplete="off"
            inputMode="tel"
            className={inputClassName}
            {...phoneReg}
            onChange={(e) => {
              e.target.value = formatPhone(e.target.value);
              onPhoneChange(e);
            }}
            onBlur={(e) => {
              e.target.value = canonicalizePhone(e.target.value);
              onPhoneBlur(e);
            }}
          />
          {errors.phone && (
            <span className="text-xs text-red-500 mt-0.5">
              {errors.phone.message}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Emergency contact
          </span>
          <input
            type="text"
            autoComplete="off"
            className={inputClassName}
            {...register("emergencyContact")}
          />
          {errors.emergencyContact && (
            <span className="text-xs text-red-500 mt-0.5">
              {errors.emergencyContact.message}
            </span>
          )}
        </div>
      </div>
      {saveError && (
        <p className="mt-3 text-xs text-red-500">{saveError}</p>
      )}
      {isDirty && (
        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto min-h-11 sm:min-h-0 px-4 py-2 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Saving…" : "Save contact info"}
          </button>
        </div>
      )}
    </form>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Display name" value={profile.name} />
      <Field label="Email" value={profile.email} />
      <Field label="Phone" value={formatPhoneForDisplay(profile.phone)} />
      <Field
        label="Emergency contact"
        value={profile.emergencyContact}
      />
    </div>
  );
};

export default ContactInfoBody;
