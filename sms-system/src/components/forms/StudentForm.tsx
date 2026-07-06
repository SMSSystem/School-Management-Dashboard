import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { arrayRemove, arrayUnion, onSnapshot, writeBatch } from "firebase/firestore";
import InputField from "../InputField";
import { ClassDocument, db } from "@/lib/firebase";
import { formatPhone } from "@/lib/phone";
import {
  userDoc,
  classCollection,
  houseCollection,
  houseDoc,
} from "@/lib/firestorePaths";

const schema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  email: z.string().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['Male', 'Female'] as const, { message: 'Gender is required.' }),
  classId: z.string().optional(),
  houseId: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const StudentForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const [classes, setClasses] = useState<(ClassDocument & { id: string })[]>([]);
  const [houses, setHouses] = useState<{ id: string; name: string }[]>([]);

  const institutionId = data?.institutionId as string | undefined;

  useEffect(() => {
    if (!institutionId) return;
    const unsub = onSnapshot(
      classCollection(db, institutionId),
      (snap) => setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassDocument & { id: string }))),
      () => {},
    );
    return unsub;
  }, [institutionId]);

  useEffect(() => {
    if (!institutionId) return;
    const unsub = onSnapshot(
      houseCollection(db, institutionId),
      (snap) => setHouses(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
      () => {},
    );
    return unsub;
  }, [institutionId]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: (data?.firstName as string) ?? "",
      lastName: (data?.lastName as string) ?? "",
      email: (data?.email as string) ?? "",
      phone: (data?.phone as string) ?? "",
      dateOfBirth: (data?.dateOfBirth as string) ?? "",
      gender: (data?.gender as 'Male' | 'Female' | undefined) ?? undefined,
      classId: (data?.classId as string) ?? "",
      houseId: (data?.houseId as string) ?? "",
    },
  });

  const onSubmit = handleSubmit(async (formData) => {
    const uid = (data?.uid ?? data?.id) as string | undefined;
    if (!uid) {
      console.log("StudentForm: no UID available", formData);
      return;
    }
    const selectedHouse = houses.find((h) => h.id === formData.houseId);
    const prevHouseId = (data?.houseId as string | undefined) || null;
    const newHouseId = formData.houseId || null;

    const batch = writeBatch(db);

    batch.update(userDoc(db, uid), {
      firstName: formData.firstName,
      lastName: formData.lastName,
      name: `${formData.firstName} ${formData.lastName}`,
      ...(formData.email !== undefined && { email: formData.email || null }),
      ...(formData.phone !== undefined && { phone: formData.phone }),
      ...(formData.dateOfBirth !== undefined && { dateOfBirth: formData.dateOfBirth || null }),
      gender: formData.gender,
      classId: formData.classId || null,
      houseId: newHouseId,
      houseName: selectedHouse?.name ?? null,
    });

    if (prevHouseId && prevHouseId !== newHouseId) {
      batch.update(houseDoc(db, institutionId!, prevHouseId), { studentIds: arrayRemove(uid) });
    }
    if (newHouseId && newHouseId !== prevHouseId) {
      batch.update(houseDoc(db, institutionId!, newHouseId), { studentIds: arrayUnion(uid) });
    }

    await batch.commit();
    onClose?.();
  });

  const selectCls =
    "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new student" : "Edit student"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="First Name" name="firstName" register={register} error={errors.firstName} />
        <InputField label="Last Name" name="lastName" register={register} error={errors.lastName} />
        <InputField label="Email" name="email" type="email" register={register} error={errors.email} />
        <InputField label="Phone" name="phone" type="tel" register={register} error={errors.phone} formatter={formatPhone} />
        <InputField label="Date of Birth" name="dateOfBirth" type="date" register={register} error={errors.dateOfBirth} />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Gender</label>
          <select {...register("gender")} className={selectCls}>
            <option value="">Select gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
          {errors.gender?.message && (
            <p className="text-xs text-red-400">{errors.gender.message.toString()}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Class</label>
          <Controller
            name="classId"
            control={control}
            render={({ field }) => (
              <select {...field} className={selectCls}>
                <option value="">No class assigned</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          />
          {errors.classId?.message && (
            <p className="text-xs text-red-400">{errors.classId.message.toString()}</p>
          )}
        </div>
        {houses.length > 0 && (
          <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500 dark:text-gray-300">House</label>
            <Controller
              name="houseId"
              control={control}
              render={({ field }) => (
                <select {...field} className={selectCls}>
                  <option value="">No house assigned</option>
                  {houses.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              )}
            />
            {errors.houseId?.message && (
              <p className="text-xs text-red-400">{errors.houseId.message.toString()}</p>
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

export default StudentForm;
