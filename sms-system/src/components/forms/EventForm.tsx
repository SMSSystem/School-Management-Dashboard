import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "react-toastify";
import InputField from "../InputField";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { eventCollection, eventDoc } from "@/lib/firestorePaths";

const schema = z
  .object({
    title: z.string().min(1, "Title is required.").max(150),
    class: z.string().max(50).optional(),
    date: z.string().min(1, "Date is required."),
    startTime: z.string().min(1, "Start time is required."),
    endTime: z.string().min(1, "End time is required."),
  })
  .refine((d) => !d.startTime || !d.endTime || d.endTime > d.startTime, {
    message: "End time must be after start time.",
    path: ["endTime"],
  });

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const EventForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { institutionId } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async (formData) => {
    if (!institutionId) {
      toast.error("Missing institution context. Please sign in again.");
      return;
    }
    const payload = {
      title: formData.title,
      class: formData.class ?? "",
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
    };
    try {
      if (type === "create") {
        await addDoc(eventCollection(db, institutionId), {
          ...payload,
          institutionId,
          createdAt: serverTimestamp(),
        });
      } else {
        const id = data?.id;
        if (typeof id !== "string") {
          toast.error("Cannot update this event: missing ID.");
          return;
        }
        await updateDoc(eventDoc(db, institutionId, id), payload);
      }
      toast.success(type === "create" ? "Event created successfully." : "Event updated successfully.");
      onClose?.();
    } catch (err) {
      console.error("EventForm submit failed:", err);
      toast.error("Failed to save event. Please try again.");
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new event" : "Edit event"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="Title"
          name="title"
          defaultValue={data?.title}
          register={register}
          error={errors.title}
        />
        <InputField
          label="Class (leave blank for school-wide)"
          name="class"
          defaultValue={data?.class}
          register={register}
          error={errors.class}
        />
        <InputField
          label="Date"
          name="date"
          type="date"
          defaultValue={data?.date}
          register={register}
          error={errors.date}
        />
        <InputField
          label="Start Time"
          name="startTime"
          type="time"
          defaultValue={data?.startTime}
          register={register}
          error={errors.startTime}
        />
        <InputField
          label="End Time"
          name="endTime"
          type="time"
          defaultValue={data?.endTime}
          register={register}
          error={errors.endTime}
        />
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default EventForm;
