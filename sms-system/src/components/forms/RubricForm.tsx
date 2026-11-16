import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useForm,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
import { useMissingRecordNotice } from "./MissingRecordNotice";
import { z } from "@/lib/zod";
import InputField from "../InputField";
import RubricCriteriaEditor from "../rubric/RubricCriteriaEditor";
import type { RubricCriterion } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  criteriaChanged,
  initialCriteria,
  validateCriteria,
} from "@/lib/rubricCriteria";
import { saveRubric } from "@/lib/rubricFormSave";
import { GRID_SHARED_WARNING } from "@/lib/rubricFileKinds";

const schema = z.object({
  title: z
    .string()
    .min(1, "Title is required.")
    .max(150, "Title must be 150 characters or less."),
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or less.")
    .optional(),
});
type RubricFormValues = z.infer<typeof schema>;

// Matches every other form's FormModal-supplied prop shape (a plain
// Record<string, FormFieldValue>) — `criteria` is read via a cast below
// since FormModal's shared FormRecord type doesn't model nested object
// arrays, the same way other forms cast individual fields to their real type.
type FormData = Partial<
  Record<string, string | number | readonly string[] | undefined>
>;

// Structured criteria-grid editor (ASSIGNMENTS_FEATURE_SPEC.md §3 decision 10).
// The editor and its checks are shared with the review of a grid read from a
// file (RubricCriteriaEditor.tsx, rubricCriteria.ts); the save is in rubricFormSave.ts.
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

  // A rubric that holds a file may have no grid, so it starts with no blank row and may be saved with none.
  const hasFile = !!data?.file;
  const savedCriteria = data?.criteria as unknown as
    | RubricCriterion[]
    | undefined;
  const [criteria, setCriteria] = useState<RubricCriterion[]>(() =>
    initialCriteria(savedCriteria, hasFile),
  );
  const [criteriaError, setCriteriaError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: String(data?.title ?? ""),
      description: String(data?.description ?? ""),
    },
  });

  const missingId = useMissingRecordNotice();
  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    const criteriaValidationError = validateCriteria(criteria, hasFile);
    setCriteriaError(criteriaValidationError);
    if (criteriaValidationError || !institutionId) return;
    try {
      const saved = await saveRubric({
        type,
        institutionId,
        id: data?.id,
        title: formData.title,
        description: formData.description,
        criteria,
        savedCriteria,
        createdBy: user?.uid ?? "",
        createdByRole: role ?? "",
      });
      if (!saved) return missingId.show();
      onClose?.();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to save rubric.",
      );
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new rubric" : "Edit rubric"}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="Title"
          name="title"
          register={register}
          error={errors.title}
        />
        <RubricDescription register={register} errors={errors} />
      </div>

      <div className="flex flex-col gap-4">
        <RubricCriteriaEditor
          criteria={criteria}
          onChange={setCriteria}
          canRemoveLast={hasFile}
        />
        <ErrorText message={criteriaError} />
      </div>

      <GridEditNote
        editing={type === "update"}
        criteria={criteria}
        saved={savedCriteria}
      />

      <ErrorText message={submitError} />

      {missingId.notice}
      <button
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

// The optional description.
function RubricDescription({
  register,
  errors,
}: {
  register: UseFormRegister<RubricFormValues>;
  errors: FieldErrors<RubricFormValues>;
}) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <label className="text-xs text-gray-500 dark:text-gray-300">
        Description (optional)
      </label>
      <textarea
        {...register("description")}
        rows={3}
        className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />
      <ErrorText message={errors.description?.message} />
    </div>
  );
}

function ErrorText({ message }: { message?: string | null }) {
  return message ? <p className="text-xs text-red-400">{message}</p> : null;
}

// Shown on Edit once the criteria differ from the saved ones: a rubric is shared and has no versions.
function GridEditNote({
  editing,
  criteria,
  saved,
}: {
  editing: boolean;
  criteria: RubricCriterion[];
  saved?: RubricCriterion[];
}) {
  if (!editing || !criteriaChanged(criteria, saved)) return null;
  return (
    <p role="note" className="text-xs text-amber-700 dark:text-amber-300">
      {GRID_SHARED_WARNING}
    </p>
  );
}

export default RubricForm;
