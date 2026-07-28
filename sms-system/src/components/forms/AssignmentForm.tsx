import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import InputField from "../InputField";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection, institutionDoc } from "@/lib/paths";

type DropdownItem = { id: string; name: string };
type SubjectOption = {
  id: string;
  name: string;
  classScope: string;
  classIds: string[];
  teacherIds: string[];
  teacherNames: string[];
};

const schema = z.object({
  termId: z.string().min(1, "Term is required."),
  subjectId: z.string().min(1, "Subject is required."),
  classId: z.string().min(1, "Class is required."),
  teacherId: z.string().min(1, "Teacher is required."),
  dueDate: z.string().min(1, "Due date is required."),
  description: z
    .string()
    .max(2000, "Description must be 2000 characters or less.")
    .optional(),
});

type FormData = Partial<
  Record<string, string | number | readonly string[] | undefined>
>;
const SELECT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";
const LABEL_CLS = "text-xs text-gray-500 dark:text-gray-300";

const AssignmentForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, institutionId } = useAuth();
  const isTeacherRole = role === "senior_teacher" || role === "regular_teacher";

  const [terms, setTerms] = useState<DropdownItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [classes, setClasses] = useState<DropdownItem[]>([]);
  const [departmentByTeacherId, setDepartmentByTeacherId] = useState<
    Record<string, string | undefined>
  >({});
  const [ownName, setOwnName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });

  const watchedSubjectId = watch("subjectId");
  const selectedSubject = subjects.find((s) => s.id === watchedSubjectId);

  // Locked teacher display: own name on create, whoever's already on the
  // document (not necessarily self) on update — never silently reassigns.
  const lockedTeacherId =
    type === "update" && data?.teacherId
      ? String(data.teacherId)
      : (user?.uid ?? "");
  const lockedTeacherName =
    type === "update" && data?.teacherName ? String(data.teacherName) : ownName;

  useEffect(() => {
    if (!isTeacherRole || !user || type === "update") return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setOwnName((snap.data().name as string) ?? "");
    });
  }, [isTeacherRole, user, type]);

  useEffect(() => {
    if (!institutionId) return;
    getDocs(institutionCollection(institutionId, "terms")).then((snap) =>
      setTerms(
        snap.docs
          .map((d) => ({ id: d.id, name: String(d.data().name ?? "") }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
  }, [institutionId]);

  // regular_teacher is limited to subjects they teach; senior_teacher/admins see all.
  useEffect(() => {
    if (!institutionId) return;
    const subjectQuery =
      role === "regular_teacher" && user
        ? query(
            institutionCollection(institutionId, "subjects"),
            where("teacherIds", "array-contains", user.uid),
          )
        : institutionCollection(institutionId, "subjects");
    const unsub = onSnapshot(subjectQuery, (snap) =>
      setSubjects(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name as string,
          classScope: d.data().classScope as string,
          classIds: (d.data().classIds ?? []) as string[],
          teacherIds: (d.data().teacherIds ?? []) as string[],
          teacherNames: (d.data().teacherNames ?? []) as string[],
        })),
      ),
    );
    return unsub;
  }, [institutionId, role, user]);

  useEffect(() => {
    if (!institutionId) return;
    getDocs(institutionCollection(institutionId, "classes")).then((snap) =>
      setClasses(
        snap.docs.map((d) => ({
          id: d.id,
          name: (d.data().name as string) ?? "",
        })),
      ),
    );
  }, [institutionId]);

  // teacherId -> departmentId, needed at write time: the deployed `assignments`
  // rule lets a senior_teacher edit any assignment in their department via this field.
  useEffect(() => {
    if (!institutionId) return;
    getDocs(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "in", ["regular_teacher", "senior_teacher"]),
      ),
    ).then((snap) => {
      const map: Record<string, string | undefined> = {};
      snap.docs.forEach((d) => {
        map[d.id] = d.data().departmentId as string | undefined;
      });
      setDepartmentByTeacherId(map);
    });
  }, [institutionId]);

  useEffect(() => {
    if (isTeacherRole && lockedTeacherId) {
      setValue("teacherId", lockedTeacherId, { shouldValidate: true });
    }
  }, [isTeacherRole, lockedTeacherId, setValue]);

  const classOptions = !selectedSubject
    ? classes
    : selectedSubject.classScope === "institution" ||
        selectedSubject.classIds.length === 0
      ? classes
      : classes.filter((c) => selectedSubject.classIds.includes(c.id));

  const teacherOptions = selectedSubject
    ? selectedSubject.teacherIds.map((id, i) => ({
        id,
        name: selectedSubject.teacherNames[i] ?? id,
      }))
    : [];

  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    if (!institutionId) return;
    try {
      const term = terms.find((t) => t.id === formData.termId);
      const cls = classes.find((c) => c.id === formData.classId);
      const teacherId = isTeacherRole
        ? lockedTeacherId
        : String(formData.teacherId ?? "");
      const teacherName = isTeacherRole
        ? lockedTeacherName
        : (teacherOptions.find((t) => t.id === teacherId)?.name ?? "");
      const departmentId =
        departmentByTeacherId[teacherId] ??
        (type === "update"
          ? (data?.departmentId as string | undefined)
          : undefined);

      const payload = {
        institutionId,
        termId: formData.termId,
        termName: term?.name ?? "",
        subjectId: formData.subjectId,
        subjectName: selectedSubject?.name ?? "",
        classId: formData.classId,
        className: cls?.name ?? "",
        teacherId,
        teacherName,
        ...(departmentId && { departmentId }),
        dueDate: formData.dueDate,
        ...(formData.description && { description: formData.description }),
      };

      if (type === "create") {
        await addDoc(institutionCollection(institutionId, "assignments"), {
          ...payload,
          createdBy: user?.uid ?? "",
          createdByRole: role ?? "",
          createdAt: serverTimestamp(),
        });
      } else {
        const id = data?.id;
        if (typeof id !== "string") {
          console.log(
            "AssignmentForm update: no string ID (mock mode)",
            formData,
          );
          return;
        }
        await updateDoc(
          institutionDoc(institutionId, "assignments", id),
          payload,
        );
      }
      onClose?.();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to save assignment.",
      );
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new assignment" : "Edit assignment"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Term</label>
          <select
            className={SELECT_CLS}
            {...register("termId")}
            defaultValue={data?.termId as string | undefined}
          >
            <option value="">Select a term</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {errors.termId?.message && (
            <p className="text-xs text-red-400">{errors.termId.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Subject</label>
          <select
            className={SELECT_CLS}
            {...register("subjectId")}
            defaultValue={data?.subjectId as string | undefined}
            onChange={(e) => {
              setValue("subjectId", e.target.value);
              setValue("classId", "");
              if (!isTeacherRole) setValue("teacherId", "");
            }}
          >
            <option value="">Select a subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {errors.subjectId?.message && (
            <p className="text-xs text-red-400">{errors.subjectId.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Class</label>
          <select
            className={SELECT_CLS}
            {...register("classId")}
            defaultValue={data?.classId as string | undefined}
          >
            <option value="">Select a class</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.classId?.message && (
            <p className="text-xs text-red-400">{errors.classId.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className={LABEL_CLS}>Teacher</label>
          {isTeacherRole ? (
            <input
              value={lockedTeacherName}
              disabled
              readOnly
              className="ring-[1.5px] ring-gray-200 p-2 rounded-md text-sm w-full bg-gray-100 text-gray-500 dark:ring-gray-700 dark:bg-gray-800 dark:text-gray-400"
            />
          ) : (
            <select
              className={SELECT_CLS}
              {...register("teacherId")}
              defaultValue={data?.teacherId as string | undefined}
            >
              <option value="">Select a teacher</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {errors.teacherId?.message && (
            <p className="text-xs text-red-400">{errors.teacherId.message}</p>
          )}
        </div>

        <InputField
          label="Due Date"
          name="dueDate"
          type="date"
          defaultValue={data?.dueDate as string | undefined}
          register={register}
          error={errors.dueDate}
        />

        <div className="flex flex-col gap-2 w-full">
          <label className={LABEL_CLS}>Description (optional)</label>
          <textarea
            {...register("description")}
            defaultValue={data?.description as string | undefined}
            rows={4}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          {errors.description?.message && (
            <p className="text-xs text-red-400">{errors.description.message}</p>
          )}
        </div>
      </div>

      {submitError && <p className="text-xs text-red-400">{submitError}</p>}

      <button
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default AssignmentForm;
