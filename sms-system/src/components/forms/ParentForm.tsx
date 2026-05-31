import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { collection, doc, getDocs, query, setDoc, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { studentsData } from "@/lib/data";
import InputField from "../InputField";

const phonePattern = /^\+?[0-9 ()-]{7,20}$/;

const schema = z.object({
  phone: z
    .string()
    .refine((v) => v === "" || phonePattern.test(v), "Enter a valid phone number.")
    .optional(),
  address: z.string().max(200).optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const ParentForm = ({
  type,
  data,
}: {
  type: "create" | "update";
  data?: FormData;
}) => {
  const { institutionId } = useAuth();
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  useEffect(() => {
    const uid = data?.uid as string | undefined;
    if (!uid) return;
    getDocs(query(collection(db, "student_parents"), where("parentId", "==", uid))).then((snap) => {
      setSelectedStudentIds(snap.docs.map((d) => d.data().studentId as string));
    });
  }, [data?.uid]);

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async (formData) => {
    const uid = data?.uid as string | undefined;
    if (!uid) {
      console.log("ParentForm: no UID available (mock mode)", formData);
      return;
    }
    const batch = writeBatch(db);
    batch.set(
      doc(db, "parents", uid),
      {
        institutionId,
        ...(formData.phone !== undefined && { phone: formData.phone }),
        ...(formData.address !== undefined && { address: formData.address }),
      },
      { merge: true }
    );
    for (const studentId of selectedStudentIds) {
      batch.set(
        doc(db, "student_parents", `${uid}_${studentId}`),
        { parentId: uid, studentId, institutionId },
        { merge: true }
      );
    }
    await batch.commit();
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">Edit parent</h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="Phone"
          name="phone"
          type="tel"
          defaultValue={data?.phone}
          register={register}
          error={errors.phone}
        />
        <InputField
          label="Address"
          name="address"
          defaultValue={data?.address}
          register={register}
          error={errors.address}
        />
        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500">Linked Students</label>
          <div className="flex flex-wrap gap-3">
            {studentsData.map((s) => (
              <label key={s.studentId} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedStudentIds.includes(s.studentId)}
                  onChange={() => toggleStudent(s.studentId)}
                  className="accent-blue-400"
                />
                {s.name}
              </label>
            ))}
            {studentsData.length === 0 && (
              <span className="text-xs text-gray-400">No students available.</span>
            )}
          </div>
        </div>
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default ParentForm;
