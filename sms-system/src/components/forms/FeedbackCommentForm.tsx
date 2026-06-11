import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  addDoc, collection, doc, getDocs, getDoc, onSnapshot,
  query, serverTimestamp, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { COMMENT_KEY } from "@/lib/commentKey";

const schema = z.object({
  studentId: z.string().min(1, "Student is required."),
  classId: z.string().min(1, "Class is required."),
  termId: z.string().min(1, "Term is required."),
  subjectId: z.string().min(1, "Subject is required."),
  conductGrade: z.enum(['G', 'S', 'F', 'U', 'P', 'D'], {
    errorMap: () => ({ message: "Conduct grade is required." }),
  }),
  commentNumber: z.coerce.number().int().min(1).max(20, {
    message: "Comment number is required.",
  }),
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
  const { user, role, institutionId } = useAuth();
  const [departmentId, setDepartmentId] = useState("");
  const [liveStudents, setLiveStudents] = useState<{ uid: string; name: string; classId?: string }[]>([]);
  const [liveTerms, setLiveTerms] = useState<{ id: string; name: string }[]>([]);
  const [liveSubjects, setLiveSubjects] = useState<{ id: string; name: string; classScope: string; classIds: string[] }[]>([]);
  const [liveClasses, setLiveClasses] = useState<{ id: string; name: string }[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<{ id: string; name: string; classScope: string; classIds: string[] } | null>(null);
  const [studentHasNoClass, setStudentHasNoClass] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
  });

  // Fetch teacher's departmentId
  useEffect(() => {
    if (user?.uid) {
      getDoc(doc(db, "teachers", user.uid)).then((snap) => {
        if (snap.exists()) setDepartmentId(snap.data().departmentId ?? "");
      });
    }
  }, [user?.uid]);

  // Live queries
  useEffect(() => {
    if (!institutionId) return;

    const unsubStudents = onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', institutionId)),
      (snap) => setLiveStudents(snap.docs.map((d) => ({
        uid: d.id,
        name: d.data().name as string,
        classId: d.data().classId as string | undefined,
      }))),
    );

    const unsubTerms = onSnapshot(
      query(collection(db, 'terms'), where('institutionId', '==', institutionId)),
      (snap) => setLiveTerms(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
    );

    const unsubClasses = onSnapshot(
      query(collection(db, 'classes'), where('institutionId', '==', institutionId)),
      (snap) => setLiveClasses(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string }))),
    );

    const subjectQuery = role === 'regular_teacher'
      ? query(
          collection(db, 'subjects'),
          where('institutionId', '==', institutionId),
          where('teacherIds', 'array-contains', user!.uid),
        )
      : query(collection(db, 'subjects'), where('institutionId', '==', institutionId));

    const unsubSubjects = onSnapshot(subjectQuery, (snap) =>
      setLiveSubjects(snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        classScope: d.data().classScope as string,
        classIds: (d.data().classIds ?? []) as string[],
      }))),
    );

    return () => {
      unsubStudents();
      unsubTerms();
      unsubClasses();
      unsubSubjects();
    };
  }, [institutionId, user?.uid, role]);

  // Pre-populate locked context fields in update mode
  useEffect(() => {
    if (type === 'update' && data) {
      if (data.studentId) setValue('studentId', data.studentId as string);
      if (data.classId) setValue('classId', data.classId as string);
      if (data.termId) setValue('termId', data.termId as string);
      if (data.conductGrade) setValue('conductGrade', data.conductGrade as 'G' | 'S' | 'F' | 'U' | 'P' | 'D');
      if (data.commentNumber) setValue('commentNumber', data.commentNumber as number);
    }
  }, [type, data, setValue]);

  // Pre-select subject in update mode once liveSubjects loads
  useEffect(() => {
    if (type === 'update' && data?.subjectId && liveSubjects.length > 0) {
      const sub = liveSubjects.find((s) => s.id === data.subjectId) ?? null;
      setSelectedSubject(sub);
      setValue('subjectId', data.subjectId as string);
    }
  }, [liveSubjects, type, data?.subjectId, setValue]);

  const studentOptions = useMemo(() => {
    if (!selectedSubject) return liveStudents;
    if (selectedSubject.classScope === 'institution') return liveStudents;
    if (selectedSubject.classIds.length === 0) return liveStudents;
    return liveStudents.filter((s) => selectedSubject.classIds.includes(s.classId ?? ''));
  }, [selectedSubject, liveStudents]);

  const onSubmit = handleSubmit(async (formData) => {
    const resolvedComment =
      formData.comment.trim() !== ""
        ? formData.comment
        : COMMENT_KEY[formData.commentNumber - 1];

    if (type === "create") {
      const q = query(
        collection(db, "feedback_comments"),
        where("studentId", "==", formData.studentId),
        where("teacherId", "==", user?.uid ?? ""),
        where("subjectId", "==", formData.subjectId),
        where("termId", "==", formData.termId),
      );
      const existingSnap = await getDocs(q);
      if (!existingSnap.empty) {
        await updateDoc(existingSnap.docs[0].ref, {
          comment: resolvedComment,
          conductGrade: formData.conductGrade,
          commentNumber: formData.commentNumber,
          subjectId: formData.subjectId,
        });
      } else {
        await addDoc(collection(db, "feedback_comments"), {
          studentId: formData.studentId,
          classId: formData.classId,
          termId: formData.termId,
          subjectId: formData.subjectId,
          conductGrade: formData.conductGrade,
          commentNumber: formData.commentNumber,
          comment: resolvedComment,
          teacherId: user?.uid ?? "",
          institutionId,
          departmentId,
          createdAt: serverTimestamp(),
        });
      }
    } else {
      const id = data?.id;
      if (typeof id !== "string") {
        console.log("FeedbackCommentForm update: no string ID (mock mode)", formData);
        return;
      }
      await updateDoc(doc(db, "feedback_comments", id), {
        subjectId: formData.subjectId,
        conductGrade: formData.conductGrade,
        commentNumber: formData.commentNumber,
        comment: resolvedComment,
        // studentId, classId, termId intentionally excluded — locked context fields
      });
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Add feedback comment" : "Edit feedback comment"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">

        {/* Subject */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Subject</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("subjectId")}
            defaultValue={data?.subjectId as string | undefined}
            onChange={(e) => {
              setValue('subjectId', e.target.value);
              const sub = liveSubjects.find((s) => s.id === e.target.value) ?? null;
              setSelectedSubject(sub);
              setValue('studentId', '');
              setValue('classId', '');
              setStudentHasNoClass(false);
            }}
          >
            <option value="">Select a subject</option>
            {liveSubjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {errors.subjectId?.message && (
            <p className="text-xs text-red-400">{errors.subjectId.message.toString()}</p>
          )}
        </div>

        {/* Student */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Student</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("studentId")}
            defaultValue={data?.studentId as string | undefined}
            onChange={(e) => {
              setValue('studentId', e.target.value);
              const student = liveStudents.find((s) => s.uid === e.target.value);
              if (student) {
                if (student.classId) {
                  setValue('classId', student.classId);
                  setStudentHasNoClass(false);
                } else {
                  setValue('classId', '');
                  setStudentHasNoClass(true);
                }
              }
            }}
          >
            <option value="">Select a student</option>
            {studentOptions.map((s) => (
              <option key={s.uid} value={s.uid}>{s.name}</option>
            ))}
          </select>
          {errors.studentId?.message && (
            <p className="text-xs text-red-400">{errors.studentId.message.toString()}</p>
          )}
        </div>

        {/* classId — hidden, auto-derived from student selection */}
        <input
          type="hidden"
          {...register("classId")}
          defaultValue={data?.classId as string | undefined}
        />
        {studentHasNoClass && (
          <div className="flex flex-col gap-2 w-full md:w-1/4">
            <label className="text-xs text-gray-500 dark:text-gray-300">
              Class <span className="text-orange-400">(student has no assigned class — select manually)</span>
            </label>
            <select
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
              onChange={(e) => setValue('classId', e.target.value)}
            >
              <option value="">Select a class</option>
              {liveClasses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.classId?.message && (
              <p className="text-xs text-red-400">{errors.classId.message.toString()}</p>
            )}
          </div>
        )}

        {/* Term */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Term</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("termId")}
            defaultValue={data?.termId as string | undefined}
          >
            <option value="">Select a term</option>
            {liveTerms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {errors.termId?.message && (
            <p className="text-xs text-red-400">{errors.termId.message.toString()}</p>
          )}
        </div>

        {/* Conduct Grade */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Conduct Grade</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("conductGrade")}
            defaultValue={data?.conductGrade as string | undefined}
          >
            <option value="">Select conduct grade</option>
            <option value="G">G — Good</option>
            <option value="S">S — Satisfactory</option>
            <option value="F">F — Fair</option>
            <option value="U">U — Unsatisfactory</option>
            <option value="P">P — Poor</option>
            <option value="D">D — Disruption</option>
          </select>
          {errors.conductGrade?.message && (
            <p className="text-xs text-red-400">{errors.conductGrade.message.toString()}</p>
          )}
        </div>

        {/* Preset Comment */}
        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">Preset Comment</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("commentNumber")}
            defaultValue={data?.commentNumber as number | undefined}
          >
            <option value="">Select a preset</option>
            {COMMENT_KEY.map((text, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}. {text}</option>
            ))}
          </select>
          {errors.commentNumber?.message && (
            <p className="text-xs text-red-400">{errors.commentNumber.message.toString()}</p>
          )}
        </div>

        {/* Comment */}
        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">Comment (overrides preset if filled in)</label>
          <textarea
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full min-h-[120px] dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-400"
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
