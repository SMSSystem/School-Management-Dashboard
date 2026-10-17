import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import PhotoUploadField from "@/components/PhotoUploadField";
import { FieldError } from "./FieldError";
import type { CreateUserErrors, CreateUserRegister } from "./formTypes";
import { eyeButtonClass, inputClass, labelClass, optionalClass, passwordInputClass } from "./styles";

// Name, email, temporary password, phones, ID number and photo: the fields every role has.
export function AccountFields({
  register,
  errors,
  canonicalizePhone,
  photoDataUrl,
  onPhotoChange,
}: {
  register: CreateUserRegister;
  errors: CreateUserErrors;
  canonicalizePhone: (value: string) => string;
  photoDataUrl: string | null;
  onPhotoChange: (dataUrl: string | null) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { onChange: onPhoneChange, onBlur: onPhoneBlur, ...phoneReg } = register("phone");
  const { onChange: onPhone2Change, onBlur: onPhone2Blur, ...phone2Reg } = register("phone2");

  return (
    <>
      <label className={labelClass}>
        First name
        <input
          id="tour-create-user-first-name"
          {...register("firstName")}
          aria-invalid={Boolean(errors.firstName)}
          autoComplete="off"
          className={inputClass}
        />
        <FieldError message={errors.firstName?.message} />
      </label>

      <label className={labelClass}>
        Last name
        <input
          id="tour-create-user-last-name"
          {...register("lastName")}
          aria-invalid={Boolean(errors.lastName)}
          autoComplete="off"
          className={inputClass}
        />
        <FieldError message={errors.lastName?.message} />
      </label>

      <label className={labelClass}>
        Email
        <input
          id="tour-create-user-email"
          {...register("email")}
          aria-invalid={Boolean(errors.email)}
          autoComplete="off"
          type="email"
          className={inputClass}
        />
        <FieldError message={errors.email?.message} />
      </label>

      <label className={labelClass}>
        Temporary password
        <div className="relative">
          <input
            id="tour-create-user-password"
            {...register("password")}
            aria-invalid={Boolean(errors.password)}
            autoComplete="new-password"
            type={showPassword ? "text" : "password"}
            className={passwordInputClass}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className={eyeButtonClass}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <FieldError message={errors.password?.message} />
        <p className="text-xs text-gray-400 dark:text-gray-500">
          The user will be required to set their own password the first
          time they sign in.
        </p>
      </label>

      <label className={labelClass}>
        Confirm password
        <div className="relative">
          <input
            id="tour-create-user-confirm-password"
            {...register("confirmPassword")}
            aria-invalid={Boolean(errors.confirmPassword)}
            autoComplete="new-password"
            type={showConfirmPassword ? "text" : "password"}
            className={passwordInputClass}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((v) => !v)}
            className={eyeButtonClass}
            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
          >
            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <FieldError message={errors.confirmPassword?.message} />
      </label>

      <label className={labelClass}>
        Phone
        <input
          id="tour-create-user-phone"
          {...phoneReg}
          aria-invalid={Boolean(errors.phone)}
          autoComplete="off"
          type="tel"
          onChange={(e) => {
            e.target.value = formatPhone(e.target.value);
            onPhoneChange(e);
          }}
          onBlur={(e) => {
            e.target.value = canonicalizePhone(e.target.value);
            onPhoneBlur(e);
          }}
          className={inputClass}
        />
        <FieldError message={errors.phone?.message} />
      </label>

      <label className={labelClass}>
        <span>
          Second phone{" "}
          <span className={optionalClass}>(optional)</span>
        </span>
        <input
          id="tour-create-user-phone2"
          {...phone2Reg}
          aria-invalid={Boolean(errors.phone2)}
          autoComplete="off"
          type="tel"
          onChange={(e) => {
            e.target.value = formatPhone(e.target.value);
            onPhone2Change(e);
          }}
          onBlur={(e) => {
            e.target.value = canonicalizePhone(e.target.value);
            onPhone2Blur(e);
          }}
          className={inputClass}
        />
        <FieldError message={errors.phone2?.message} />
      </label>

      <label className={labelClass}>
        <span>
          Citizen ID or TRN{" "}
          <span className={optionalClass}>(optional)</span>
        </span>
        <input
          id="tour-create-user-id-number"
          {...register("idNumber")}
          aria-invalid={Boolean(errors.idNumber)}
          autoComplete="off"
          maxLength={50}
          className={inputClass}
        />
        <FieldError message={errors.idNumber?.message} />
      </label>

      <PhotoUploadField
        photoUrl={photoDataUrl}
        onChange={onPhotoChange}
        size="sm"
        chooseLabel="Choose file"
        replaceLabel="Replace"
        removeLabel="Clear"
        fieldLabel="Photo"
      />
    </>
  );
}
