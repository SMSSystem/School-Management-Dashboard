import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { arrayRemove, arrayUnion, collection, doc, onSnapshot, query, where, writeBatch } from "firebase/firestore";
import InputField from "../InputField";
import { ClassDocument, db } from "@/lib/firebase";
import { formatPhone } from "@/lib/phone";

const schema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  email: z.string().email("Enter a valid email address.").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  dateOfBirth: z.string().optional(),
  institutionStudentId: z.string().optional(),
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
      query(collection(db, "classes"), where("institutionId", "==", institutionId)),
      (snap) => setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassDocument & { id: string }))),
      () => {},
    );
    return unsub;
  }, [institutionId]);

  useEffect(() => {
    if (!institutionId) return;
    const unsub = onSnapshot(
      query(collection(db, "houses"), where("institutionId", "==", institutionId)),
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
      address: (data?.address as string) ?? "",
      dateOfBirth: (data?.dateOfBirth as string) ?? "",
      institutionStudentId: (data?.institutionStudentId as string) ?? "",
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

    batch.update(doc(db, "users", uid), {
      firstName: formData.firstName,
      lastName: formData.lastName,
      name: `${formData.firstName} ${formData.lastName}`,
      ...(formData.email !== undefined && { email: formData.email || null }),
      ...(formData.phone !== undefined && { phone: formData.phone }),
      ...(formData.address !== undefined && { address: formData.address }),
      ...(formData.dateOfBirth !== undefined && { dateOfBirth: formData.dateOfBirth || null }),
      ...(formData.institutionStudentId !== undefined && {
        institutionStudentId: formData.institutionStudentId || null,
      }),
      classId: formData.classId || null,
      houseId: newHouseId,
      houseName: selectedHouse?.name ?? null,
    });

    if (prevHouseId && prevHouseId !== newHouseId) {
      batch.update(doc(db, "houses", prevHouseId), { studentIds: arrayRemove(uid) });
    }
    if (newHouseId && newHouseId !== prevHouseId) {
      batch.update(doc(db, "houses", newHouseId), { studentIds: arrayUnion(uid) });
    }

    await batch.commit();
    onClose?.();
  });

  const selectCls =
    "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 w-full sm:w-auto";

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
        <InputField label="Address" name="address" register={register} error={errors.address} />
        <InputField label="Date of Birth" name="dateOfBirth" type="date" register={register} error={errors.dateOfBirth} />
        <InputField label="Student ID" name="institutionStudentId" register={register} error={errors.institutionStudentId} />
        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 w-full sm:w-auto">
          Class
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
          {errors.classId?.message && <p className="text-xs text-red-400">{errors.classId.message}</p>}
        </label>
        {houses.length > 0 && (
          <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 w-full sm:w-auto">
            House
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
            {errors.houseId?.message && <p className="text-xs text-red-400">{errors.houseId.message}</p>}
          </label>
        )}
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default StudentForm;
