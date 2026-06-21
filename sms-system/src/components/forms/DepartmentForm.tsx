import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
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
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { institutionId } = useAuth();
  const [teachers, setTeachers] = useState<{ uid: string; name: string }[]>([]);

  useEffect(() => {
    if (!institutionId) return;
    const unsub = onSnapshot(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "senior_teacher"),
      ),
      (snap) =>
        setTeachers(
          snap.docs
            .map((d) => ({ uid: d.id, name: d.data().name as string }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      () => setTeachers([]),
    );
    return unsub;
  }, [institutionId]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: (data?.name as string) ?? "",
      headTeacherId: (data?.headTeacherId as string) ?? "",
    },
  });

  const onSubmit = handleSubmit(async (formData) => {
    if (type === "create") {
      await addDoc(collection(db, "departments"), {
        ...formData,
        institutionId,
      });
    } else {
      const id = data?.id;
      if (!id) return;
      await updateDoc(doc(db, "departments", String(id)), { ...formData });
    }
    onClose?.();
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
          >
            <option value="">
              {teachers.length === 0 ? "No teachers found — create teachers first" : "Select a teacher"}
            </option>
            {teachers.map((t) => (
              <option key={t.uid} value={t.uid}>
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
