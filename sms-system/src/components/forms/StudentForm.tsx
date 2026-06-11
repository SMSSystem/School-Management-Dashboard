import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import InputField from "../InputField";
import { ClassDocument, db } from "@/lib/firebase";

const schema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  phone: z.string().optional(),
  address: z.string().optional(),
  classId: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const StudentForm = ({
  type,
  data,
}: {
  type: "create" | "update";
  data?: FormData;
}) => {
  const [classes, setClasses] = useState<(ClassDocument & { id: string })[]>([]);

  useEffect(() => {
    const institutionId = data?.institutionId as string | undefined;
    if (!institutionId) return;
    getDocs(query(collection(db, "classes"), where("institutionId", "==", institutionId)))
      .then((snap) =>
        setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassDocument & { id: string })))
      )
      .catch(() => {});
  }, [data?.institutionId]);

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
      console.log("StudentForm: no UID available (mock mode)", formData);
      return;
    }
    await updateDoc(doc(db, "users", uid), {
      firstName: formData.firstName,
      lastName: formData.lastName,
      name: `${formData.firstName} ${formData.lastName}`,
      ...(formData.phone !== undefined && { phone: formData.phone }),
      ...(formData.address !== undefined && { address: formData.address }),
      ...(formData.classId !== undefined && { classId: formData.classId || null }),
    });
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new student" : "Edit student"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="First Name"
          name="firstName"
          defaultValue={data?.firstName}
          register={register}
          error={errors.firstName}
        />
        <InputField
          label="Last Name"
          name="lastName"
          defaultValue={data?.lastName}
          register={register}
          error={errors.lastName}
        />
        <InputField
          label="Phone"
          name="phone"
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
        <label className="flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 w-full sm:w-auto">
          Class
          <select
            {...register("classId")}
            defaultValue={(data?.classId as string) ?? ""}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">No class assigned</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default StudentForm;
