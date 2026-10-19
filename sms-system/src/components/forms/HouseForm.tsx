import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { useInstitutionUsers } from "@/hooks/useInstitutionUsers";
import { queryClient } from "@/lib/queryClient";
import { planHouseChanges, toggledStudentIds } from "@/lib/houseMembership";

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

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  // The students, from the shared cached users list (hooks/useInstitutionUsers.ts, kept five minutes), so opening this
  // form inside that window reads nothing. Only an Update shows them.
  const { data: institutionUsers, isLoading, isError } = useInstitutionUsers({ enabled: type === "update" });
  const allStudents = useMemo<StudentRow[]>(
    () =>
      (institutionUsers ?? [])
        .filter((u) => u.role === "student")
        .map((u) => ({
          uid: u.id,
          name: (u.name as string) ?? "",
          houseId: u.houseId as string | undefined,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [institutionUsers],
  );
  const studentsLoaded = !isLoading || isError;
  // Who was in this house when the list first showed: the boxes are compared with it at save, so only the
  // students the person ticked or unticked are written.
  const initialIds = useRef<Set<string>>(new Set());
  // Guards the one-time pre-check below: a refreshed list (the cache refetching, or the save invalidating it) must
  // not reset whatever the user has ticked or unticked since.
  const hasPreChecked = useRef(false);

  // Pre-check the students already in this house, once, from the first list that arrives.
  useEffect(() => {
    if (type !== "update" || !institutionUsers || hasPreChecked.current) return;
    const houseId = String(data?.id ?? "");
    initialIds.current = new Set(allStudents.filter((s) => s.houseId === houseId).map((s) => s.uid));
    setCheckedIds(new Set(initialIds.current));
    hasPreChecked.current = true;
  }, [type, institutionUsers, allStudents, data?.id]);

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
    if (!institutionId) return;
    if (type === "create") {
      await addDoc(institutionCollection(institutionId, "houses"), {
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

      await updateDoc(institutionDoc(institutionId, "houses", houseIdStr), {
        name: formData.name,
        description: formData.description || null,
        updatedAt: serverTimestamp(),
      });

      // Only the students whose box was changed are written, and each one's house is read again just now (the list on
      // screen may be minutes old), so a student another admin has already moved is not moved back.
      const toggled = toggledStudentIds(initialIds.current, checkedIds);
      const freshHouseIds = new Map<string, string | null | undefined>();
      await Promise.all(
        toggled.map(async (uid) => {
          const snap = await getDoc(doc(db, "users", uid));
          if (snap.exists()) freshHouseIds.set(uid, snap.data().houseId as string | null | undefined);
        }),
      );
      const { toAssign, toRemove } = planHouseChanges({
        initialIds: initialIds.current,
        checkedIds,
        freshHouseIds,
        houseId: houseIdStr,
      });

      if (toAssign.length > 0 || toRemove.length > 0) {
        const batch = writeBatch(db);
        for (const uid of toAssign) {
          batch.update(doc(db, "users", uid), {
            houseId: houseIdStr,
            houseName: formData.name,
          });
        }
        for (const uid of toRemove) {
          batch.update(doc(db, "users", uid), {
            houseId: null,
            houseName: null,
          });
        }
        await batch.commit();
        // The Houses list derives its Students and Class columns from the shared users list, and this form reads it:
        // refresh it now that students have moved (a cancelled form changes nothing and leaves it alone).
        queryClient.invalidateQueries({ queryKey: ["users", institutionId] });
      }
    }
    setTimeout(() => onClose?.(), 50);
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new house" : "Edit house"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-2 w-full md:w-1/2">
          <label className="text-xs text-gray-500 dark:text-gray-300">House Name</label>
          <input
            {...register("name")}
            autoComplete="off"
            defaultValue={(data?.name as string) ?? ""}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          {errors.name?.message && (
            <p className="text-xs text-red-400">{errors.name.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full">
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
