import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { DATA_MODE } from "@/lib/data";
import InputField from "../InputField";

const schema = z.object({
  name: z.string().min(1, "Name is required.").max(100),
  startDate: z.string().min(1, "Start date is required."),
  endDate: z.string().min(1, "End date is required."),
  status: z.enum(["upcoming", "active", "closed"]),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const TermForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { institutionId } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    try {
      if (type === "create") {
        await addDoc(collection(db, "terms"), {
          ...formData,
          institutionId,
        });
      } else {
        const id = data?.id;
        if (DATA_MODE !== "live") return;
        if (!id) return;
        await updateDoc(doc(db, "terms", String(id)), { ...formData });
      }
      onClose?.();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save term.");
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new term" : "Edit term"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="Term Name"
          name="name"
          defaultValue={data?.name}
          register={register}
          error={errors.name}
        />
        <InputField
          label="Start Date"
          name="startDate"
          type="date"
          defaultValue={data?.startDate}
          register={register}
          error={errors.startDate}
        />
        <InputField
          label="End Date"
          name="endDate"
          type="date"
          defaultValue={data?.endDate}
          register={register}
          error={errors.endDate}
        />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Status</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("status")}
            defaultValue={data?.status}
          >
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
          {errors.status?.message && (
            <p className="text-xs text-red-400">{errors.status.message.toString()}</p>
          )}
        </div>
      </div>
      {submitError && (
        <p className="text-xs text-red-400">{submitError}</p>
      )}
      <button
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default TermForm;
