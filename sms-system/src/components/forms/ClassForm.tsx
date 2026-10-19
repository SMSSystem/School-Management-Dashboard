import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "@/lib/zod";
import { addDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import InputField from "../InputField";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { termsData, USE_MOCK } from "@/lib/data";
import { useInstitutionAcademicCalendar } from "@/hooks/useInstitutionAcademicCalendar";

// CUSTOM_CALENDAR_MODE_SPEC.md §4/§8 — grade ("Programme Year" for
// custom-mode institutions) is optional there, since a non-K-12 programme
// doesn't map onto a 1–13 grade level. The academic-mode path is untouched
// (still required, same validation, same error messages) — only the
// custom-mode branch adds a z.preprocess so a blank input is treated as
// "not provided" rather than z.coerce.number() silently coercing "" to 0
// and failing .min(1).
function buildSchema(isCustomMode: boolean) {
  return z.object({
    name: z.string().min(1, "Class name is required.").max(50),
    capacity: z.coerce.number().int().min(1, "Capacity must be at least 1.").max(200, "Capacity cannot exceed 200."),
    grade: isCustomMode
      ? z.preprocess(
          (val) => (val === '' ? undefined : val),
          z.coerce.number().int().min(1, "Grade must be between 1 and 13.").max(13, "Grade must be between 1 and 13.").optional(),
        )
      : z.coerce.number().int().min(1, "Grade must be between 1 and 13.").max(13, "Grade must be between 1 and 13."),
    supervisor: z.string().max(100).optional(),
    termId: z.string().min(1, "Term is required."),
  });
}

type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const ClassForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { institutionId, institution } = useAuth();
  const isCustomMode = institution?.calendarMode === 'custom';
  const { allTerms, activeTimeBlocks, loading: termsLoading } = useInstitutionAcademicCalendar();
  // allTerms stays permanently null for calendarMode === 'custom' (§3.1's
  // singular/plural split) — activeTimeBlocks is the list to use instead.
  // Already effectively "sorted" for custom mode (one term per block, in
  // the confirmed default-selection order), so no termNumber sort needed.
  const sortedTerms = isCustomMode
    ? activeTimeBlocks.map((b) => b.term)
    : allTerms
    ? [...allTerms].sort((a, b) => (a.termNumber ?? 0) - (b.termNumber ?? 0))
    : [];

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(buildSchema(isCustomMode)),
  });

  const onSubmit = handleSubmit(async (formData) => {
    if (!institutionId) return;
    if (type === "create") {
      await addDoc(institutionCollection(institutionId, "classes"), {
        ...formData,
        institutionId,
        createdAt: serverTimestamp(),
      });
    } else {
      const id = data?.id;
      if (typeof id !== "string") {
        console.log("ClassForm update: no string ID (mock mode)", formData);
        return;
      }
      await updateDoc(institutionDoc(institutionId, "classes", id), {
        name: formData.name,
        capacity: formData.capacity,
        grade: formData.grade,
        supervisor: formData.supervisor,
        termId: formData.termId,
      });
    }
    onClose?.();
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new class" : "Edit class"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="Class Name"
          name="name"
          defaultValue={data?.name}
          register={register}
          error={errors.name}
        />
        <InputField
          label="Capacity"
          name="capacity"
          type="number"
          defaultValue={data?.capacity}
          register={register}
          error={errors.capacity}
        />
        <InputField
          label={isCustomMode ? "Programme Year" : "Grade"}
          name="grade"
          type="number"
          defaultValue={data?.grade}
          register={register}
          error={errors.grade}
        />
        <InputField
          label="Supervisor"
          name="supervisor"
          defaultValue={data?.supervisor}
          register={register}
          error={errors.supervisor}
        />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Term</label>
          <select
            // Remounts once terms finish loading so defaultValue (which only
            // applies at mount, since this select is uncontrolled) is
            // re-evaluated against the now-populated <option> list — without
            // this, a class's existing term is stuck on the placeholder if
            // allTerms hadn't loaded yet on the first render.
            key={!USE_MOCK && termsLoading ? "terms-loading" : "terms-loaded"}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("termId")}
            defaultValue={data?.termId as string | undefined}
            disabled={!USE_MOCK && termsLoading}
          >
            <option value="">{!USE_MOCK && termsLoading ? 'Loading terms…' : 'Select a term'}</option>
            {(USE_MOCK ? termsData : sortedTerms).map((term) => (
              <option key={term.id} value={term.id}>
                {term.name}
              </option>
            ))}
          </select>
          {errors.termId?.message && (
            <p className="text-xs text-red-400">{errors.termId.message.toString()}</p>
          )}
        </div>
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default ClassForm;
