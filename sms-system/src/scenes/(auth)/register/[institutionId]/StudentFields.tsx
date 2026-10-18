import type { FieldErrors, UseFormRegister } from "react-hook-form";
import PhotoUploadField from "@/components/PhotoUploadField";
import { MIN_AGE_YEARS, type RegistrationFormValues } from "@/lib/registrationFormLogic";
import FieldError from "./FieldError";
import { inputClass, labelClass, withAutoCapitalize, withPhoneFormat } from "./fieldHelpers";

// The "Student Information" section: the student's details and the optional photo.
export default function StudentFields({
  register,
  errors,
  photoDataUrl,
  onPhotoChange,
}: {
  register: UseFormRegister<RegistrationFormValues>;
  errors: FieldErrors<RegistrationFormValues>;
  photoDataUrl: string | null;
  onPhotoChange: (dataUrl: string | null) => void;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 mb-3">
        Student Information
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Last name
          <input
            autoComplete="off"
            {...withAutoCapitalize(register("student.lastName"))}
            className={inputClass}
          />
          <FieldError message={errors.student?.lastName?.message} />
        </label>
        <label className={labelClass}>
          First name
          <input
            autoComplete="off"
            {...withAutoCapitalize(register("student.firstName"))}
            className={inputClass}
          />
          <FieldError message={errors.student?.firstName?.message} />
        </label>
        <label className={labelClass}>
          <span>
            Middle name{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input
            autoComplete="off"
            {...withAutoCapitalize(register("student.middleName"))}
            className={inputClass}
          />
          <FieldError message={errors.student?.middleName?.message} />
        </label>
        <label className={labelClass}>
          Requested class/grade
          <input
            autoComplete="off"
            {...register("student.requestedClass")}
            className={inputClass}
          />
          <FieldError message={errors.student?.requestedClass?.message} />
        </label>
        <label className={labelClass}>
          <span>
            Date of birth{" "}
            <span className="font-normal text-gray-400">
              (must be at least {MIN_AGE_YEARS} years old)
            </span>
          </span>
          <input
            type="date"
            {...register("student.dateOfBirth")}
            className={inputClass}
          />
          <FieldError message={errors.student?.dateOfBirth?.message} />
        </label>
        <label className={labelClass}>
          Gender
          <select {...register("student.gender")} className={inputClass}>
            <option value="">Select gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          <FieldError message={errors.student?.gender?.message} />
        </label>
        <label className={labelClass}>
          Email
          <input
            type="email"
            autoComplete="off"
            {...register("student.email")}
            className={inputClass}
          />
          <FieldError message={errors.student?.email?.message} />
        </label>
        <label className={labelClass}>
          <span>
            Last school attended{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input
            autoComplete="off"
            {...register("student.lastSchoolAttended")}
            className={inputClass}
          />
          <FieldError
            message={errors.student?.lastSchoolAttended?.message}
          />
        </label>
        <label className={labelClass}>
          <span>
            Phone{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input
            autoComplete="off"
            {...withPhoneFormat(register("student.phone"))}
            className={inputClass}
          />
          <FieldError message={errors.student?.phone?.message} />
        </label>
        <label className={labelClass}>
          <span>
            Second phone{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input
            autoComplete="off"
            {...withPhoneFormat(register("student.phone2"))}
            className={inputClass}
          />
          <FieldError message={errors.student?.phone2?.message} />
        </label>
        <label className={labelClass}>
          <span>
            Citizen ID or TRN{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </span>
          <input
            autoComplete="off"
            {...register("student.citizenId")}
            className={inputClass}
          />
          <FieldError message={errors.student?.citizenId?.message} />
        </label>
        <PhotoUploadField
          photoUrl={photoDataUrl}
          onChange={onPhotoChange}
          size="sm"
          darkMode={false}
          chooseLabel="Choose file"
          replaceLabel="Replace"
          removeLabel="Clear"
          fieldLabel="Photo"
        />
      </div>
    </section>
  );
}
