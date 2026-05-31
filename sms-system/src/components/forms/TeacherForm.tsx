import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { doc, writeBatch } from "firebase/firestore";
import InputField from "../InputField";
import { db } from "@/lib/firebase";

const schema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  phone: z.string().optional(),
  address: z.string().optional(),
  teacherType: z.enum(["regular", "senior"]),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const TeacherForm = ({
  type,
  data,
}: {
  type: "create" | "update";
  data?: FormData;
}) => {
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
      console.log("TeacherForm: no UID available (mock mode)", formData);
      return;
    }
    const batch = writeBatch(db);
    batch.set(
      doc(db, "users", uid),
      {
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: `${formData.firstName} ${formData.lastName}`,
        ...(formData.phone !== undefined && { phone: formData.phone }),
        ...(formData.address !== undefined && { address: formData.address }),
      },
      { merge: true }
    );
    batch.set(
      doc(db, "teachers", uid),
      { teacherType: formData.teacherType },
      { merge: true }
    );
    await batch.commit();
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
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Teacher Type</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("teacherType")}
            defaultValue={data?.teacherType as string | undefined}
          >
            <option value="regular">Regular</option>
            <option value="senior">Senior</option>
          </select>
          {errors.teacherType?.message && (
            <p className="text-xs text-red-400">{errors.teacherType.message.toString()}</p>
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
