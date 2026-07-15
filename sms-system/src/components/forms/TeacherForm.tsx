import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  doc,
  getDoc,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import InputField from "../InputField";
import { db, type SubjectDocument } from "@/lib/firebase";
import { formatPhone } from "@/lib/phone";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection, institutionDoc } from "@/lib/paths";

type SubjectOption = SubjectDocument & { id: string };

const schema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  phone: z.string().optional(),
  teacherType: z.enum(["regular", "senior"]),
  departmentId: z.string().optional(),
  assignedClassId: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const TeacherForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { institutionId } = useAuth();
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);

  useEffect(() => {
    if (!institutionId) return;
    const unsub = onSnapshot(
      institutionCollection(institutionId, "departments"),
      (snap) => setDepartments(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
      () => {},
    );
    return unsub;
  }, [institutionId]);

  useEffect(() => {
    if (!institutionId) return;
    const unsub = onSnapshot(
      institutionCollection(institutionId, "classes"),
      (snap) => setClasses(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
      () => {},
    );
    return unsub;
  }, [institutionId]);

  useEffect(() => {
    if (!institutionId) return;
    const unsub = onSnapshot(
      institutionCollection(institutionId, "subjects"),
      (snap) =>
        setSubjects(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as SubjectDocument) })),
        ),
      () => {},
    );
    return unsub;
  }, [institutionId]);

  const toggleSubject = (id: string) => {
    setSelectedSubjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  // Read-only rollup of every class covered by the currently-selected subjects —
  // institution-scoped subjects count as every class, class-scoped subjects count
  // as their own classIds. Recomputes live as subject checkboxes are toggled.
  const classesTaught = (() => {
    const names = new Set<string>();
    for (const subjectId of selectedSubjectIds) {
      const subject = subjects.find((s) => s.id === subjectId);
      if (!subject) continue;
      if (subject.classScope === "institution") {
        classes.forEach((c) => names.add(c.name));
      } else {
        subject.classNames.forEach((n) => names.add(n));
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  })();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      teacherType: "regular",
      departmentId: "",
      assignedClassId: "",
    },
  });

  const teacherType = watch("teacherType");
  const uid = (data?.uid ?? data?.id) as string | undefined;

  useEffect(() => {
    if (type !== "update" || !uid) return;
    getDoc(doc(db, "users", uid)).then((userSnap) => {
      const u = userSnap.data();
      reset({
        firstName: (u?.firstName as string) ?? "",
        lastName: (u?.lastName as string) ?? "",
        phone: (u?.phone as string) ?? "",
        teacherType: u?.role === "senior_teacher" ? "senior" : "regular",
        departmentId: (u?.departmentId as string) ?? "",
        assignedClassId: (u?.assignedClassId as string) ?? "",
      });
    });
  }, [uid, type, reset]);

  // Prefill selected subjects from teacherIds once, when both the target uid and
  // the live subjects list are available. A ref (not state) guards against
  // re-running on every subjects onSnapshot update, which would otherwise stomp
  // on the user's in-progress checkbox edits.
  const initializedSubjectsForUid = useRef<string | null>(null);
  useEffect(() => {
    if (type !== "update" || !uid) return;
    if (subjects.length === 0) return;
    if (initializedSubjectsForUid.current === uid) return;
    setSelectedSubjectIds(subjects.filter((s) => s.teacherIds?.includes(uid)).map((s) => s.id));
    initializedSubjectsForUid.current = uid;
  }, [type, uid, subjects]);

  const onSubmit = handleSubmit(async (formData) => {
    if (!uid) {
      console.log("TeacherForm: no UID available", formData);
      return;
    }
    if (!institutionId) return;
    const batch = writeBatch(db);
    const selectedDeptName = departments.find((d) => d.id === formData.departmentId)?.name ?? null;
    const teacherName = `${formData.firstName} ${formData.lastName}`;
    batch.set(
      doc(db, "users", uid),
      {
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: teacherName,
        department: selectedDeptName,
        departmentId: formData.departmentId || null,
        ...(formData.phone !== undefined && { phone: formData.phone }),
        ...(formData.teacherType === "senior" && {
          assignedClassId: formData.assignedClassId || null,
          assignedClassName: formData.assignedClassId
            ? (classes.find((c) => c.id === formData.assignedClassId)?.name ?? null)
            : null,
        }),
      },
      { merge: true },
    );

    // Reverse-editor for the subjects/{id}.teacherIds relationship: add or remove
    // this teacher from every subject whose selection state changed, preserving
    // every other teacher already on that subject.
    for (const subject of subjects) {
      const currentlyAssigned = subject.teacherIds?.includes(uid) ?? false;
      const shouldBeAssigned = selectedSubjectIds.includes(subject.id);
      if (currentlyAssigned === shouldBeAssigned) continue;

      const nextTeacherIds = shouldBeAssigned
        ? [...(subject.teacherIds ?? []), uid]
        : (subject.teacherIds ?? []).filter((id) => id !== uid);
      const nextTeacherNames = shouldBeAssigned
        ? [...(subject.teacherNames ?? []), teacherName]
        : (subject.teacherNames ?? []).filter((_, i) => subject.teacherIds?.[i] !== uid);

      batch.update(institutionDoc(institutionId, "subjects", subject.id), {
        teacherIds: nextTeacherIds,
        teacherNames: nextTeacherNames,
      });
    }

    await batch.commit();
    onClose?.();
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new teacher" : "Edit teacher"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="First Name"
          name="firstName"
          register={register}
          error={errors.firstName}
        />
        <InputField
          label="Last Name"
          name="lastName"
          register={register}
          error={errors.lastName}
        />
        <InputField
          label="Phone"
          name="phone"
          type="tel"
          register={register}
          error={errors.phone}
          formatter={formatPhone}
        />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Teacher Type</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("teacherType")}
          >
            <option value="regular">Regular</option>
            <option value="senior">Senior</option>
          </select>
          {errors.teacherType?.message && (
            <p className="text-xs text-red-400">{errors.teacherType.message.toString()}</p>
          )}
        </div>

        {departments.length > 0 && (
          <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500 dark:text-gray-300">Department</label>
            <select
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
              {...register("departmentId")}
            >
              <option value="">No department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {errors.departmentId?.message && (
              <p className="text-xs text-red-400">{errors.departmentId.message.toString()}</p>
            )}
          </div>
        )}

        {teacherType === "senior" && classes.length > 0 && (
          <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500 dark:text-gray-300">Assigned Class</label>
            <select
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
              {...register("assignedClassId")}
            >
              <option value="">No class assigned</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.assignedClassId?.message && (
              <p className="text-xs text-red-400">{errors.assignedClassId.message.toString()}</p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">Subjects</label>
          <div className="ring-[1.5px] ring-gray-300 rounded-md p-2 max-h-40 overflow-y-auto dark:ring-gray-600 dark:bg-gray-900">
            {subjects.length === 0 ? (
              <p className="text-xs text-gray-400">No subjects found.</p>
            ) : (
              subjects.map((subject) => (
                <label key={subject.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSubjectIds.includes(subject.id)}
                    onChange={() => toggleSubject(subject.id)}
                  />
                  {subject.name}
                </label>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">
            Classes Taught (from selected subjects — not directly editable)
          </label>
          {classesTaught.length === 0 ? (
            <p className="text-xs text-gray-400">No classes yet — select a subject above.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {classesTaught.map((name) => (
                <span
                  key={name}
                  className="text-xs px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                >
                  {name}
                </span>
              ))}
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

export default TeacherForm;
