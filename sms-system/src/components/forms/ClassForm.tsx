import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import InputField from "../InputField";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { termsData } from "@/lib/data";

const schema = z.object({
  name: z.string().min(1, "Class name is required.").max(50),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1.").max(200, "Capacity cannot exceed 200."),
  grade: z.coerce.number().int().min(1, "Grade must be between 1 and 13.").max(13, "Grade must be between 1 and 13."),
  supervisor: z.string().max(100).optional(),
  termId: z.string().min(1, "Term is required."),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const ClassForm = ({
  type,
  data,
}: {
  type: "create" | "update";
  data?: FormData;
}) => {
  const { institutionId } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async (formData) => {
    if (type === "create") {
      await addDoc(collection(db, "classes"), {
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
      await updateDoc(doc(db, "classes", id), {
        name: formData.name,
        capacity: formData.capacity,
        grade: formData.grade,
        supervisor: formData.supervisor,
        termId: formData.termId,
      });
    }
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
          label="Grade"
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
          <label className="text-xs text-gray-500">Term</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("termId")}
            defaultValue={data?.termId as string | undefined}
          >
            <option value="">Select a term</option>
            {termsData.map((term) => (
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
