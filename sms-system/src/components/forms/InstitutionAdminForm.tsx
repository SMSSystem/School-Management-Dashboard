import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { doc, writeBatch } from "firebase/firestore";
import InputField from "../InputField";
import { db } from "@/lib/firebase";
import { formatPhone } from "@/lib/phone";

const schema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const InstitutionAdminForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
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
      console.log("InstitutionAdminForm: no UID available (mock mode)", formData);
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
    await batch.commit();
    onClose?.();
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create institution admin" : "Edit institution admin"}
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
          type="tel"
          defaultValue={data?.phone}
          register={register}
          error={errors.phone}
          formatter={formatPhone}
        />
        <InputField
          label="Address"
          name="address"
          defaultValue={data?.address}
          register={register}
          error={errors.address}
        />
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default InstitutionAdminForm;
