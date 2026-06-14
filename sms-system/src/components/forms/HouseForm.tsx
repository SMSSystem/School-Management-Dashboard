import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import InputField from "../InputField";

const schema = z.object({
  name: z.string().min(1, "House name is required.").max(100),
  description: z.string().max(300, "Description must be 300 characters or fewer.").optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

type StudentRow = { uid: string; name: string; houseId?: string };

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

  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [studentsLoaded, setStudentsLoaded] = useState(false);

  // Load students in update mode
  useEffect(() => {
    if (type !== "update" || !institutionId) return;
    const houseId = String(data?.id ?? "");
    const unsub = onSnapshot(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "student"),
      ),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({
            uid: d.id,
            name: d.data().name as string,
            houseId: d.data().houseId as string | undefined,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setAllStudents(rows);
        // Pre-check students already in this house
        setCheckedIds(new Set(rows.filter((s) => s.houseId === houseId).map((s) => s.uid)));
        setStudentsLoaded(true);
      },
      () => { setAllStudents([]); setStudentsLoaded(true); },
    );
    return unsub;
  }, [type, institutionId, data?.id]);

  const toggleStudent = (uid: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

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
      const houseIdStr = String(id);

      await updateDoc(doc(db, "houses", houseIdStr), {
        name: formData.name,
        description: formData.description || null,
        updatedAt: serverTimestamp(),
      });

      // Determine which students changed house membership
      const originalIds = new Set(
        allStudents.filter((s) => s.houseId === houseIdStr).map((s) => s.uid),
      );

      const toAssign = allStudents.filter(
        (s) => checkedIds.has(s.uid) && !originalIds.has(s.uid),
      );
      const toRemove = allStudents.filter(
        (s) => !checkedIds.has(s.uid) && originalIds.has(s.uid),
      );

      if (toAssign.length > 0 || toRemove.length > 0) {
        const batch = writeBatch(db);
        for (const s of toAssign) {
          batch.update(doc(db, "users", s.uid), {
            houseId: houseIdStr,
            houseName: formData.name,
          });
        }
        for (const s of toRemove) {
          batch.update(doc(db, "users", s.uid), {
            houseId: null,
            houseName: null,
          });
        }
        await batch.commit();
      }
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

        {type === "update" && (
          <div className="flex flex-col gap-2 w-full">
            <label className="text-xs text-gray-500 dark:text-gray-300">
              Students in this house
            </label>
            {!studentsLoaded ? (
              <p className="text-xs text-gray-400">Loading students…</p>
            ) : allStudents.length === 0 ? (
              <p className="text-xs text-gray-400">No students found.</p>
            ) : (
              <div className="ring-[1.5px] ring-gray-300 rounded-md p-2 max-h-56 overflow-y-auto dark:ring-gray-600 dark:bg-gray-900">
                {allStudents.map((s) => (
                  <label
                    key={s.uid}
                    className="flex items-center gap-2 text-sm py-1 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checkedIds.has(s.uid)}
                      onChange={() => toggleStudent(s.uid)}
                    />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400">
              {checkedIds.size} student{checkedIds.size !== 1 ? "s" : ""} selected
            </p>
          </div>
        )}
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
