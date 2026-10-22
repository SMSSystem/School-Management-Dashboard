import type { FieldValues, Path, UseFormRegister } from "react-hook-form";
import { ROOMY_FIELD_CLS, ROOMY_INPUT_CLS, ROOMY_LABEL_CLS, type FieldVariant } from "./forms/exam/examFormStyles";

// Browsers only meaningfully offer autofill suggestions on these types —
// autoComplete has no real effect on checkbox/radio/file/date/number/etc.
const AUTOFILL_PRONE_TYPES = new Set(["text", "email", "tel", "password", "search"]);

type InputFieldProps<T extends FieldValues> = {
  label: string;
  type?: string;
  register: UseFormRegister<T>;
  name: Path<T>;
  defaultValue?: React.InputHTMLAttributes<HTMLInputElement>["defaultValue"];
  error?: { message?: string };
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  /** Optional value formatter applied on each change event (e.g. phone masking). */
  formatter?: (value: string) => string;
  /** Optional normaliser applied when the field loses focus (e.g. phone canonicalisation). */
  onBlurFormatter?: (value: string) => string;
  /** "roomy" is the look of the Edit Student Details form (used by the exam form); the default is every other form's. */
  variant?: FieldVariant;
};

const InputField = <T extends FieldValues,>({
  label,
  type = "text",
  register,
  name,
  defaultValue,
  error,
  inputProps,
  formatter,
  onBlurFormatter,
  variant = "default",
}: InputFieldProps<T>) => {
  const roomy = variant === "roomy";
  const { onChange: regOnChange, onBlur: regOnBlur, ...regProps } = register(name);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (formatter) e.target.value = formatter(e.target.value);
    regOnChange(e);
    inputProps?.onChange?.(e);
  };

  // react-hook-form reads the value from the event target on blur too, so
  // normalising before forwarding keeps the form state and the DOM in step.
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (onBlurFormatter) e.target.value = onBlurFormatter(e.target.value);
    regOnBlur(e);
    inputProps?.onBlur?.(e);
  };

  const formattedDefault =
    formatter && typeof defaultValue === "string"
      ? formatter(defaultValue)
      : defaultValue;

  return (
    <div className={roomy ? ROOMY_FIELD_CLS : "flex flex-col gap-2 w-full md:w-1/4"}>
      <label htmlFor={roomy ? name : undefined} className={roomy ? ROOMY_LABEL_CLS : "text-xs text-gray-500 dark:text-gray-300"}>
        {label}
      </label>
      <input
        id={roomy ? name : undefined}
        type={type}
        autoComplete={AUTOFILL_PRONE_TYPES.has(type) ? "off" : undefined}
        {...regProps}
        className={roomy ? ROOMY_INPUT_CLS : "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"}
        {...inputProps}
        onChange={handleChange}
        onBlur={handleBlur}
        defaultValue={formattedDefault}
      />
      {error?.message && (
        <p className="text-xs text-red-400">{error.message.toString()}</p>
      )}
    </div>
  );
};

export default InputField;
