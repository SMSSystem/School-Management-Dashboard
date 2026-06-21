import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import InputField from "../InputField";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

const schema = z.object({
  name: z.string().min(1, "Class name is required.").max(50),
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1.").max(200, "Capacity cannot exceed 200."),
  grade: z.coerce.number().int().min(1, "Grade must be between 1 and 13.").max(13, "Grade must be between 1 and 13."),
  supervisorId: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;
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
  const { institutionId } = useAuth();
  const [teachers, setTeachers] = useState<{ uid: string; name: string }[]>([]);

  useEffect(() => {
    if (!institutionId) return;
    return onSnapshot(
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
    );
  }, [institutionId]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async (formData) => {
    const supervisor = teachers.find((t) => t.uid === formData.supervisorId);
    if (type === "create") {
      await addDoc(collection(db, "classes"), {
        name: formData.name,
        capacity: formData.capacity,
        grade: formData.grade,
        supervisorId: formData.supervisorId ?? null,
        supervisorName: supervisor?.name ?? null,
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
        supervisorId: formData.supervisorId ?? null,
        supervisorName: supervisor?.name ?? null,
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
          label="Grade"
          name="grade"
          type="number"
          defaultValue={data?.grade}
          register={register}
          error={errors.grade}
        />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Supervisor</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            defaultValue={data?.supervisorId as string | undefined}
            {...register("supervisorId")}
          >
            <option value="">— None —</option>
            {teachers.map((t) => (
              <option key={t.uid} value={t.uid}>
                {t.name}
              </option>
            ))}
          </select>
          {errors.supervisorId && (
            <p className="text-xs text-red-400">{errors.supervisorId.message}</p>
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
