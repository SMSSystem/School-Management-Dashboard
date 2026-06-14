import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import InputField from "../InputField";
import { db } from "@/lib/firebase";
import { formatPhone } from "@/lib/phone";
import { useAuth } from "@/lib/AuthContext";

const schema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  phone: z.string().optional(),
  address: z.string().optional(),
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

  useEffect(() => {
    if (!institutionId) return;
    const unsub = onSnapshot(
      query(collection(db, "departments"), where("institutionId", "==", institutionId)),
      (snap) => setDepartments(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
      () => {},
    );
    return unsub;
  }, [institutionId]);

  useEffect(() => {
    if (!institutionId) return;
    const unsub = onSnapshot(
      query(collection(db, "classes"), where("institutionId", "==", institutionId)),
      (snap) => setClasses(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
      () => {},
    );
    return unsub;
  }, [institutionId]);

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
      address: "",
      teacherType: "regular",
      departmentId: "",
      assignedClassId: "",
    },
  });

  const teacherType = watch("teacherType");
  const uid = (data?.uid ?? data?.id) as string | undefined;

  useEffect(() => {
    if (type !== "update" || !uid) return;
    Promise.all([
      getDoc(doc(db, "users", uid)),
      getDoc(doc(db, "teachers", uid)),
    ]).then(([userSnap, teacherSnap]) => {
      const u = userSnap.data();
      const t = teacherSnap.data();
      reset({
        firstName: (u?.firstName as string) ?? "",
        lastName: (u?.lastName as string) ?? "",
        phone: (u?.phone as string) ?? "",
        address: (u?.address as string) ?? "",
        teacherType: (t?.teacherType as "regular" | "senior") ?? "regular",
        departmentId: (t?.departmentId as string) ?? "",
        assignedClassId: (u?.assignedClassId as string) ?? "",
      });
    });
  }, [uid, type, reset]);

  const onSubmit = handleSubmit(async (formData) => {
    if (!uid) {
      console.log("TeacherForm: no UID available", formData);
      return;
    }
    const batch = writeBatch(db);
    const selectedDeptName = departments.find((d) => d.id === formData.departmentId)?.name ?? null;
    batch.set(
      doc(db, "users", uid),
      {
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: `${formData.firstName} ${formData.lastName}`,
        department: selectedDeptName,
        ...(formData.phone !== undefined && { phone: formData.phone }),
        ...(formData.address !== undefined && { address: formData.address }),
        ...(formData.teacherType === "senior" && {
          assignedClassId: formData.assignedClassId || null,
          assignedClassName: formData.assignedClassId
            ? (classes.find((c) => c.id === formData.assignedClassId)?.name ?? null)
            : null,
        }),
      },
      { merge: true },
    );
    batch.set(
      doc(db, "teachers", uid),
      {
        teacherType: formData.teacherType,
        departmentId: formData.departmentId || null,
      },
      { merge: true },
    );
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
        <InputField
          label="Address"
          name="address"
          register={register}
          error={errors.address}
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
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default TeacherForm;
