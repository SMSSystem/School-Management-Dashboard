import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { DATA_MODE, teachersData } from "@/lib/data";
import InputField from "../InputField";

const schema = z.object({
  name: z.string().min(1, "Department name is required.").max(100),
  headTeacherId: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const DepartmentForm = ({
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
      await addDoc(collection(db, "departments"), {
        ...formData,
        institutionId,
      });
    } else {
      const id = data?.id;
      if (DATA_MODE !== "live") {
        console.log("DepartmentForm update: non-live mode, skipping Firestore", formData);
        return;
      }
      if (!id) return;
      await updateDoc(doc(db, "departments", String(id)), { ...formData });
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new department" : "Edit department"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="Department Name"
          name="name"
          defaultValue={data?.name}
          register={register}
          error={errors.name}
        />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Head Teacher</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("headTeacherId")}
            defaultValue={data?.headTeacherId as string | undefined}
          >
            <option value="">Select a teacher</option>
            {teachersData.map((t) => (
              <option key={t.teacherId} value={t.teacherId}>
                {t.name}
              </option>
            ))}
          </select>
          {errors.headTeacherId?.message && (
            <p className="text-xs text-red-400">{errors.headTeacherId.message.toString()}</p>
          )}
        </div>
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default DepartmentForm;
