import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "react-toastify";
import InputField from "../InputField";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { lessonCollection, lessonDoc } from "@/lib/firestorePaths";

const schema = z.object({
  subject: z.string().min(1, "Subject is required.").max(100),
  class: z.string().min(1, "Class is required.").max(50),
  teacher: z.string().min(1, "Teacher is required.").max(100),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const LessonForm = ({
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
    try {
      if (type === "create") {
        await addDoc(lessonCollection(db, institutionId), {
          ...formData,
          institutionId,
          createdAt: serverTimestamp(),
        });
      } else {
        const id = data?.id;
        if (typeof id !== "string") {
          toast.error("Cannot update this lesson: missing ID.");
          return;
        }
        await updateDoc(lessonDoc(db, institutionId, id), { ...formData });
      }
      toast.success(type === "create" ? "Lesson created successfully." : "Lesson updated successfully.");
      onClose?.();
    } catch (err) {
      console.error("LessonForm submit failed:", err);
      toast.error("Failed to save lesson. Please try again.");
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new lesson" : "Edit lesson"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="Subject"
          name="subject"
          defaultValue={data?.subject}
          register={register}
          error={errors.subject}
        />
        <InputField
          label="Class"
          name="class"
          defaultValue={data?.class}
          register={register}
          error={errors.class}
        />
        <InputField
          label="Teacher"
          name="teacher"
          defaultValue={data?.teacher}
          register={register}
          error={errors.teacher}
        />
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default LessonForm;
