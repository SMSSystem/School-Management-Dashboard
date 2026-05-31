import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, collection, doc, getDocs, getDoc, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { studentsData, classesData, termsData } from "@/lib/data";

const schema = z.object({
  studentId: z.string().min(1, "Student is required."),
  classId: z.string().min(1, "Class is required."),
  termId: z.string().min(1, "Term is required."),
  comment: z.string().min(1, "Comment is required.").max(2000),
});

type Inputs = z.infer<typeof schema>;
type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const FeedbackCommentForm = ({
  type,
  data,
}: {
  type: "create" | "update";
  data?: FormData;
}) => {
  const { user, institutionId } = useAuth();
  const [departmentId, setDepartmentId] = useState("");

  useEffect(() => {
    if (user?.uid) {
      getDoc(doc(db, "teachers", user.uid)).then((snap) => {
        if (snap.exists()) setDepartmentId(snap.data().departmentId ?? "");
      });
    }
  }, [user?.uid]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async (formData) => {
    if (type === "create") {
      const q = query(
        collection(db, "feedback_comments"),
        where("studentId", "==", formData.studentId),
        where("teacherId", "==", user?.uid ?? ""),
        where("classId", "==", formData.classId),
        where("termId", "==", formData.termId),
      );
      const existingSnap = await getDocs(q);
      if (!existingSnap.empty) {
        await updateDoc(existingSnap.docs[0].ref, { comment: formData.comment });
      } else {
        await addDoc(collection(db, "feedback_comments"), {
          ...formData,
          teacherId: user?.uid ?? "",
          institutionId,
          departmentId,
          createdAt: new Date().toISOString(),
        });
      }
    } else {
      const id = data?.id;
      if (typeof id !== "string") {
        console.log("FeedbackCommentForm update: no string ID (mock mode)", formData);
        return;
      }
      await updateDoc(doc(db, "feedback_comments", id), {
        studentId: formData.studentId,
        classId: formData.classId,
        termId: formData.termId,
        comment: formData.comment,
      });
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Add feedback comment" : "Edit feedback comment"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Student</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("studentId")}
            defaultValue={data?.studentId as string | undefined}
          >
            <option value="">Select a student</option>
            {studentsData.map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {s.name}
              </option>
            ))}
          </select>
          {errors.studentId?.message && (
            <p className="text-xs text-red-400">{errors.studentId.message.toString()}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Class</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("classId")}
            defaultValue={data?.classId as string | undefined}
          >
            <option value="">Select a class</option>
            {classesData.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.classId?.message && (
            <p className="text-xs text-red-400">{errors.classId.message.toString()}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Term</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            {...register("termId")}
            defaultValue={data?.termId as string | undefined}
          >
            <option value="">Select a term</option>
            {termsData.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {errors.termId?.message && (
            <p className="text-xs text-red-400">{errors.termId.message.toString()}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500">Comment</label>
          <textarea
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full min-h-[120px]"
            {...register("comment")}
            defaultValue={data?.comment as string | undefined}
            placeholder="Write feedback for this student..."
          />
          {errors.comment?.message && (
            <p className="text-xs text-red-400">{errors.comment.message.toString()}</p>
          )}
        </div>
      </div>
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Submit" : "Update"}
      </button>
    </form>
  );
};

export default FeedbackCommentForm;
