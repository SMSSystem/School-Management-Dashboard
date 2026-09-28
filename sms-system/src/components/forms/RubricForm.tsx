import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import InputField from "../InputField";
import type { RubricCriterion, RubricLevel } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection, institutionDoc } from "@/lib/paths";

const schema = z.object({
  title: z.string().min(1, "Title is required.").max(150, "Title must be 150 characters or less."),
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or less.")
    .optional(),
});

// Matches every other form's FormModal-supplied prop shape (a plain
// Record<string, FormFieldValue>) — `criteria` is read via a cast below
// since FormModal's shared FormRecord type doesn't model nested object
// arrays, the same way other forms cast individual fields to their real type.
type FormData = Partial<
  Record<string, string | number | readonly string[] | undefined>
>;
const SELECT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";
const LABEL_CLS = "text-xs text-gray-500 dark:text-gray-300";

const newLevel = (): RubricLevel => ({ label: "", points: 0, description: "" });
const newCriterion = (): RubricCriterion => ({
  id: crypto.randomUUID(),
  name: "",
  maxPoints: 0,
  levels: [newLevel()],
});

// Structured criteria-grid editor (ASSIGNMENTS_FEATURE_SPEC.md §3 decision 10)
// — kept as plain component state rather than registered through
// react-hook-form: this codebase has no existing precedent for nested
// dynamic array fields (no useFieldArray usage anywhere), and criteria/levels
// nest two levels deep, so plain state + explicit add/remove handlers (the
// same shape HouseForm.tsx already uses for its own non-scalar student-list
// state) stays simpler than wiring up deeply-indexed field-array paths.
const RubricForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, institutionId } = useAuth();

  const [criteria, setCriteria] = useState<RubricCriterion[]>(() => {
    const existing = data?.criteria as unknown as RubricCriterion[] | undefined;
    return existing?.length ? existing : [newCriterion()];
  });
  const [criteriaError, setCriteriaError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: (data?.title as string | undefined) ?? "",
      description: (data?.description as string | undefined) ?? "",
    },
  });

  const updateCriterion = (id: string, patch: Partial<RubricCriterion>) => {
    setCriteria((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const updateLevel = (criterionId: string, index: number, patch: Partial<RubricLevel>) => {
    setCriteria((prev) =>
      prev.map((c) =>
        c.id === criterionId
          ? { ...c, levels: c.levels.map((lvl, i) => (i === index ? { ...lvl, ...patch } : lvl)) }
          : c,
      ),
    );
  };

  const addLevel = (criterionId: string) => {
    setCriteria((prev) =>
      prev.map((c) => (c.id === criterionId ? { ...c, levels: [...c.levels, newLevel()] } : c)),
    );
  };

  const removeLevel = (criterionId: string, index: number) => {
    setCriteria((prev) =>
      prev.map((c) =>
        c.id === criterionId ? { ...c, levels: c.levels.filter((_, i) => i !== index) } : c,
      ),
    );
  };

  // Validated on submit rather than per-keystroke — matches this form's
  // other fields, which only surface errors via zod at submit time too.
  const validateCriteria = (): string | null => {
    if (criteria.length === 0) return "At least one criterion is required.";
    for (const c of criteria) {
      if (!c.name.trim()) return "Every criterion needs a name.";
      if (!(c.maxPoints > 0)) return `"${c.name || "Untitled criterion"}" needs a max points value greater than 0.`;
      if (c.levels.length === 0) return `"${c.name}" needs at least one performance level.`;
      for (const lvl of c.levels) {
        if (!lvl.label.trim()) return `Every performance level under "${c.name}" needs a label.`;
        if (lvl.points < 0) return `Performance level points under "${c.name}" cannot be negative.`;
      }
    }
    return null;
  };

  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    const criteriaValidationError = validateCriteria();
    setCriteriaError(criteriaValidationError);
    if (criteriaValidationError || !institutionId) return;

    try {
      const payload = {
        institutionId,
        title: formData.title,
        ...(formData.description && { description: formData.description }),
        criteria,
      };

      if (type === "create") {
        await addDoc(institutionCollection(institutionId, "rubrics"), {
          ...payload,
          createdBy: user?.uid ?? "",
          createdByRole: role ?? "",
          createdAt: serverTimestamp(),
        });
      } else {
        const id = data?.id;
        if (typeof id !== "string") {
          console.log("RubricForm update: no string ID (mock mode)", formData);
          return;
        }
        await updateDoc(institutionDoc(institutionId, "rubrics", id), payload);
      }
      onClose?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save rubric.");
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new rubric" : "Edit rubric"}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="Title" name="title" register={register} error={errors.title} />

        <div className="flex flex-col gap-2 w-full">
          <label className={LABEL_CLS}>Description (optional)</label>
          <textarea
            {...register("description")}
            rows={3}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          {errors.description?.message && (
            <p className="text-xs text-red-400">{errors.description.message}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Criteria</h2>
          <button
            type="button"
            onClick={() => setCriteria((prev) => [...prev, newCriterion()])}
            className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            + Add criterion
          </button>
        </div>

        {criteria.map((criterion, cIndex) => (
          <div
            key={criterion.id}
            className="flex flex-col gap-3 p-3 rounded-md ring-[1.5px] ring-gray-200 dark:ring-gray-700"
          >
            <div className="flex flex-wrap gap-4 items-start">
              <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
                <label className={LABEL_CLS}>Criterion name</label>
                <input
                  value={criterion.name}
                  onChange={(e) => updateCriterion(criterion.id, { name: e.target.value })}
                  className={SELECT_CLS}
                />
              </div>
              <div className="flex flex-col gap-2 w-32">
                <label className={LABEL_CLS}>Max points</label>
                <input
                  type="number"
                  min={0}
                  value={criterion.maxPoints}
                  onChange={(e) =>
                    updateCriterion(criterion.id, { maxPoints: Number(e.target.value) })
                  }
                  className={SELECT_CLS}
                />
              </div>
              {criteria.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCriteria((prev) => prev.filter((_, i) => i !== cIndex))}
                  className="text-xs font-medium px-3 py-1.5 mt-5 rounded-md border border-gray-300 dark:border-gray-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700"
                >
                  Remove criterion
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className={LABEL_CLS}>Performance levels</label>
                <button
                  type="button"
                  onClick={() => addLevel(criterion.id)}
                  className="text-xs font-medium px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  + Add level
                </button>
              </div>
              {criterion.levels.map((lvl, lIndex) => (
                <div key={lIndex} className="flex flex-wrap gap-2 items-center">
                  <input
                    placeholder="Label (e.g. Excellent)"
                    value={lvl.label}
                    onChange={(e) =>
                      updateLevel(criterion.id, lIndex, { label: e.target.value })
                    }
                    className={`${SELECT_CLS} flex-1 min-w-[140px]`}
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="Points"
                    value={lvl.points}
                    onChange={(e) =>
                      updateLevel(criterion.id, lIndex, { points: Number(e.target.value) })
                    }
                    className={`${SELECT_CLS} w-24`}
                  />
                  <input
                    placeholder="Description (optional)"
                    value={lvl.description ?? ""}
                    onChange={(e) =>
                      updateLevel(criterion.id, lIndex, { description: e.target.value })
                    }
                    className={`${SELECT_CLS} flex-1 min-w-[160px]`}
                  />
                  {criterion.levels.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLevel(criterion.id, lIndex)}
                      className="text-xs text-red-600 dark:text-red-400 px-2"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {criteriaError && <p className="text-xs text-red-400">{criteriaError}</p>}
      </div>

      {submitError && <p className="text-xs text-red-400">{submitError}</p>}

      <button
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default RubricForm;
