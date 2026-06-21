import type { FieldValues, Path, UseFormRegister } from "react-hook-form";

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
}: InputFieldProps<T>) => {
  const { onChange: regOnChange, ...regProps } = register(name);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (formatter) e.target.value = formatter(e.target.value);
    regOnChange(e);
    inputProps?.onChange?.(e);
  };

  const formattedDefault =
    formatter && typeof defaultValue === "string"
      ? formatter(defaultValue)
      : defaultValue;

  return (
    <div className="flex flex-col gap-2 w-full md:w-1/4">
      <label className="text-xs text-gray-500 dark:text-gray-300">{label}</label>
      <input
        type={type}
        {...regProps}
        className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
        {...inputProps}
        onChange={handleChange}
        defaultValue={formattedDefault}
      />
      {error?.message && (
        <p className="text-xs text-red-400">{error.message.toString()}</p>
      )}
    </div>
  );
};

export default InputField;
