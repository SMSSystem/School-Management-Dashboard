import type { FieldErrors, UseFormRegister, UseFormSetValue } from "react-hook-form";
import type { SubjectFormValues } from "@/lib/subjectFormLogic";

// The Course Work and Exam weights (each one sets the other to the rest of 100) and their total.
export default function WeightFields({
  register,
  setValue,
  errors,
  weightSum,
}: {
  register: UseFormRegister<SubjectFormValues>;
  setValue: UseFormSetValue<SubjectFormValues>;
  errors: FieldErrors<SubjectFormValues>;
  weightSum: number;
}) {
  const { onChange: onCwChange, ...cwRest } = register('cwWeight');
  const { onChange: onExamChange, ...examRest } = register('examWeight');

  return (
    <>
      <div className="flex flex-col gap-2 w-full md:w-1/4">
        <label className="text-xs text-gray-500 dark:text-gray-300">Course Work Weight (%)</label>
        <input
          type="number"
          min={0}
          max={100}
          {...cwRest}
          onChange={(e) => {
            onCwChange(e);
            const cw = Math.max(0, Math.min(100, Number(e.target.value)));
            if (!isNaN(cw)) setValue('examWeight', 100 - cw);
          }}
          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        {errors.cwWeight?.message && (
          <p className="text-xs text-red-400">{errors.cwWeight.message.toString()}</p>
        )}
      </div>

      <div className="flex flex-col gap-2 w-full md:w-1/4">
        <label className="text-xs text-gray-500 dark:text-gray-300">Exam Weight (%)</label>
        <input
          type="number"
          min={0}
          max={100}
          {...examRest}
          onChange={(e) => {
            onExamChange(e);
            const exam = Math.max(0, Math.min(100, Number(e.target.value)));
            if (!isNaN(exam)) setValue('cwWeight', 100 - exam);
          }}
          className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        {errors.examWeight?.message && (
          <p className="text-xs text-red-400">{errors.examWeight.message.toString()}</p>
        )}
      </div>

      <div className="w-full">
        <p className={`text-xs ${weightSum !== 100 ? 'text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
          Total: {weightSum}% — must equal 100
        </p>
      </div>
    </>
  );
}
