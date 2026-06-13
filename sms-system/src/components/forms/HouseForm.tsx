import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import InputField from "../InputField";

const schema = z.object({
  name: z.string().min(1, "House name is required.").max(100),
  description: z.string().max(300, "Description must be 300 characters or fewer.").optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const HouseForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { institutionId, user } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: (data?.name as string) ?? "",
      description: (data?.description as string) ?? "",
    },
  });

  const onSubmit = handleSubmit(async (formData) => {
    if (type === "create") {
      await addDoc(collection(db, "houses"), {
        institutionId,
        name: formData.name,
        description: formData.description || null,
        createdAt: serverTimestamp(),
        createdBy: user?.uid ?? "",
        updatedAt: serverTimestamp(),
      });
    } else {
      const id = data?.id;
      if (!id) return;
      await updateDoc(doc(db, "houses", String(id)), {
        name: formData.name,
        description: formData.description || null,
        updatedAt: serverTimestamp(),
      });
    }
    onClose?.();
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new house" : "Edit house"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="House Name"
          name="name"
          defaultValue={data?.name as string | undefined}
          register={register}
          error={errors.name}
        />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Description</label>
          <textarea
            {...register("description")}
            defaultValue={(data?.description as string) ?? ""}
            rows={3}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 resize-none"
          />
          {errors.description?.message && (
            <p className="text-xs text-red-400">{errors.description.message}</p>
          )}
        </div>
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default HouseForm;
