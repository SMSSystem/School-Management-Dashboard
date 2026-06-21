import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import InputField from "../InputField";
import { formatPhone } from "@/lib/phone";

const phonePattern = /^\+?[0-9 ()-]{7,20}$/;

const schema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  email: z.string().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z
    .string()
    .refine((v) => v === "" || phonePattern.test(v), "Enter a valid phone number.")
    .optional(),
  address: z.string().max(200).optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

interface StudentRow {
  uid: string;
  name: string;
}

const ParentForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { institutionId } = useAuth();
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Load all students in institution
  useEffect(() => {
    if (!institutionId) return;
    const unsub = onSnapshot(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "student"),
      ),
      (snap) => {
        setAllStudents(
          snap.docs
            .map((d) => ({ uid: d.id, name: (d.data().name as string) ?? d.id }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      () => {},
    );
    return unsub;
  }, [institutionId]);

  // Pre-load existing links for this parent
  useEffect(() => {
    const uid = (data?.uid ?? data?.id) as string | undefined;
    if (!uid) return;
    getDocs(query(collection(db, "student_parents"), where("parentId", "==", uid))).then((snap) => {
      setSelectedStudentIds(snap.docs.map((d) => d.data().studentId as string));
    });
  }, [data?.uid, data?.id]);

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId],
    );
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: (data?.firstName as string) ?? "",
      lastName: (data?.lastName as string) ?? "",
      email: (data?.email as string) ?? "",
      phone: (data?.phone as string) ?? "",
      address: (data?.address as string) ?? "",
    },
  });

  const onSubmit = handleSubmit(async (formData) => {
    const uid = (data?.uid ?? data?.id) as string | undefined;
    if (!uid) return;
    const batch = writeBatch(db);

    batch.set(
      doc(db, "users", uid),
      {
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: `${formData.firstName} ${formData.lastName}`,
        ...(formData.email !== undefined && { email: formData.email || null }),
        ...(formData.phone !== undefined && { phone: formData.phone }),
        ...(formData.address !== undefined && { address: formData.address }),
      },
      { merge: true },
    );

    const existingSnap = await getDocs(
      query(collection(db, "student_parents"), where("parentId", "==", uid)),
    );
    const existingIds = new Set(existingSnap.docs.map((d) => d.data().studentId as string));
    const newIds = new Set(selectedStudentIds);

    for (const existingDoc of existingSnap.docs) {
      if (!newIds.has(existingDoc.data().studentId as string)) {
        batch.delete(existingDoc.ref);
      }
    }

    for (const studentId of selectedStudentIds) {
      if (!existingIds.has(studentId)) {
        batch.set(
          doc(db, "student_parents", `${uid}_${studentId}`),
          { parentId: uid, studentId, institutionId },
          { merge: true },
        );
      }
    }

    await batch.commit();
    onClose?.();
  });

  const linkedIds = new Set(selectedStudentIds);
  const linkedStudents = allStudents.filter((s) => linkedIds.has(s.uid));
  const unlinkedStudents = allStudents.filter((s) => !linkedIds.has(s.uid));

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create new Parent/Guardian" : "Edit Parent/Guardian"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="First Name" name="firstName" register={register} error={errors.firstName} />
        <InputField label="Last Name" name="lastName" register={register} error={errors.lastName} />
        <InputField label="Email" name="email" type="email" register={register} error={errors.email} />
        <InputField
          label="Phone"
          name="phone"
          type="tel"
          register={register}
          error={errors.phone}
          formatter={formatPhone}
        />
        <InputField label="Address" name="address" register={register} error={errors.address} />

        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">Linked Children</label>
          {allStudents.length === 0 ? (
            <p className="text-xs text-gray-400">No students found — create student accounts first.</p>
          ) : (
            <div className="space-y-3">
              {linkedStudents.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Currently linked</p>
                  <div className="flex flex-wrap gap-3">
                    {linkedStudents.map((s) => (
                      <label key={s.uid} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => toggleStudent(s.uid)}
                          className="accent-blue-400"
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {unlinkedStudents.length > 0 && (
                <div>
                  {linkedStudents.length > 0 && (
                    <p className="text-xs text-gray-400 mb-1">Available to link</p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {unlinkedStudents.map((s) => (
                      <label key={s.uid} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => toggleStudent(s.uid)}
                          className="accent-blue-400"
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default ParentForm;
