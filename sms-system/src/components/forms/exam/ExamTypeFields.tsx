import type { FieldErrors, UseFormRegister } from "react-hook-form";
import InputField from "../../InputField";
import { LABEL_CLS, SELECT_CLS } from "../assignment/styles";
import type { ExamFormValues } from "./examFormSchema";
import {
  EXAM_ANSWER_MODES,
  EXAM_ANSWER_MODE_DESCRIPTIONS,
  EXAM_ANSWER_MODE_LABELS,
  EXAM_CATEGORY_LABELS,
  EXAM_CATEGORY_TYPES,
  EXAM_SELECTABLE_CATEGORIES,
  EXAM_VALUE_TYPES,
  EXAM_VALUE_TYPE_LABELS,
  type ExamAnswerMode,
} from "@/types/exams";

const BOX_CLS = "flex flex-col gap-2 w-full md:w-1/4";

// The exam's title, type, category and (for Multiple Choice) answer mode. Every category is listed; only the ones
// in EXAM_SELECTABLE_CATEGORIES can be chosen yet, and the rest are shown disabled.
export default function ExamTypeFields({
  register,
  errors,
  valueType,
  categoryType,
  answerMode,
  lockCategoryAndMode,
  online,
}: {
  register: UseFormRegister<ExamFormValues>;
  errors: FieldErrors<ExamFormValues>;
  valueType: string;
  categoryType: string;
  answerMode: string;
  /** The exam already has questions, which depend on its category and answer mode. */
  lockCategoryAndMode: boolean;
  online: boolean;
}) {
  const isMultipleChoice = categoryType === "multiple_choice";
  return (
    <>
      <InputField
        label={online ? "Title" : "Title (optional)"}
        name="title"
        register={register}
        error={errors.title}
      />

      <div className={BOX_CLS}>
        <label className={LABEL_CLS}>{online ? "Type" : "Type (optional)"}</label>
        <select className={SELECT_CLS} {...register("valueType")}>
          <option value="">Select a type</option>
          {EXAM_VALUE_TYPES.map((t) => (
            <option key={t} value={t}>
              {EXAM_VALUE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {errors.valueType?.message && <p className="text-xs text-red-400">{errors.valueType.message}</p>}
      </div>

      {valueType === "other" && (
        <InputField label="Name of the type" name="valueTypeLabel" register={register} error={errors.valueTypeLabel} />
      )}

      <div className={BOX_CLS}>
        <label className={LABEL_CLS}>{online ? "Category" : "Category (optional)"}</label>
        <select className={SELECT_CLS} disabled={lockCategoryAndMode} {...register("categoryType")}>
          <option value="">None</option>
          {EXAM_CATEGORY_TYPES.map((c) => {
            const selectable = EXAM_SELECTABLE_CATEGORIES.includes(c);
            return (
              <option key={c} value={c} disabled={!selectable}>
                {EXAM_CATEGORY_LABELS[c]}
                {selectable ? "" : " (coming soon)"}
              </option>
            );
          })}
        </select>
        {errors.categoryType?.message && <p className="text-xs text-red-400">{errors.categoryType.message}</p>}
      </div>

      {isMultipleChoice && (
        <div className={BOX_CLS}>
          <label className={LABEL_CLS}>Answer mode</label>
          <select className={SELECT_CLS} disabled={lockCategoryAndMode} {...register("answerMode")}>
            {EXAM_ANSWER_MODES.map((m) => (
              <option key={m} value={m}>
                {EXAM_ANSWER_MODE_LABELS[m]}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400">{EXAM_ANSWER_MODE_DESCRIPTIONS[answerMode as ExamAnswerMode]}</p>
          {lockCategoryAndMode && (
            <p className="text-xs text-gray-400">The category and answer mode are fixed once an exam has questions.</p>
          )}
          {errors.answerMode?.message && <p className="text-xs text-red-400">{errors.answerMode.message}</p>}
        </div>
      )}
    </>
  );
}
