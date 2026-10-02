import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { actorName, buildAuditEntry, staffFallback } from "@/lib/auditLog";
import { feedbackCommentDetail } from "@/lib/teacherAudit";
import { COMMENT_KEY, firstNameOf, renderComment } from "@/lib/commentKey";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useInstitutionSubjects } from "@/hooks/useInstitutionSubjects";

const schema = z.object({
  studentId: z.string().min(1, "Student is required."),
  classId: z.string().min(1, "Class is required."),
  termId: z.string().min(1, "Term is required."),
  subjectId: z.string().min(1, "Subject is required."),
  conductGrade: z.enum(["G", "S", "F", "U", "P", "D"] as const, {
    message: "Conduct grade is required.",
  }),
  commentNumbers: z
    .array(z.number().int().min(1).max(20))
    .min(1, "Select at least one comment.")
    .max(5, "Maximum 5 comments allowed."),
});

type FormData = Partial<
  Record<string, string | number | readonly string[] | undefined>
>;

const FeedbackCommentForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, institutionId, displayName } = useAuth();
  const [departmentId, setDepartmentId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [liveStudents, setLiveStudents] = useState<
    {
      uid: string;
      name: string;
      classId?: string;
      gender?: "Male" | "Female";
    }[]
  >([]);
  const { data: liveTerms = [] } = useInstitutionTerms();
  const { data: liveSubjects = [] } = useInstitutionSubjects();
  const { data: liveClasses = [] } = useInstitutionClasses();
  const [selectedSubject, setSelectedSubject] = useState<{
    id: string;
    name: string;
    classScope: string;
    classIds: string[];
  } | null>(null);
  const [studentHasNoClass, setStudentHasNoClass] = useState(false);
  const [selectedCommentNumbers, setSelectedCommentNumbers] = useState<
    number[]
  >([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
  });

  const selectedStudentId = watch("studentId");
  const selectedStudent = liveStudents.find((s) => s.uid === selectedStudentId);

  // Fetch teacher's departmentId and name
  useEffect(() => {
    if (user?.uid) {
      getDoc(doc(db, "users", user.uid)).then((snap) => {
        if (snap.exists()) {
          setDepartmentId(snap.data().departmentId ?? "");
          setTeacherName(snap.data().name ?? "");
        }
      });
    }
  }, [user?.uid]);

  // Live queries
  useEffect(() => {
    if (!institutionId) return;

    const unsubStudents = onSnapshot(
      query(
        collection(db, "users"),
        where("role", "==", "student"),
        where("institutionId", "==", institutionId),
      ),
      (snap) =>
        setLiveStudents(
          snap.docs.map((d) => ({
            uid: d.id,
            name: d.data().name as string,
            classId: d.data().classId as string | undefined,
            gender: d.data().gender as "Male" | "Female" | undefined,
          })),
        ),
    );

    return unsubStudents;
  }, [institutionId, user, role]);

  // Pre-populate locked context fields in update mode
  useEffect(() => {
    if (type === "update" && data) {
      if (data.studentId) setValue("studentId", data.studentId as string);
      if (data.classId) setValue("classId", data.classId as string);
      if (data.termId) setValue("termId", data.termId as string);
      if (data.conductGrade)
        setValue(
          "conductGrade",
          data.conductGrade as "G" | "S" | "F" | "U" | "P" | "D",
        );
      // Support both new (commentNumbers: number[]) and legacy (commentNumber: number) shapes
      const rawNums = data.commentNumbers as unknown as number[] | undefined;
      const rawNum = data.commentNumber as number | undefined;
      const preselected =
        Array.isArray(rawNums) && rawNums.length > 0
          ? rawNums
          : rawNum != null
            ? [rawNum]
            : [];
      setSelectedCommentNumbers(preselected);
      setValue("commentNumbers", preselected);
    }
  }, [type, data, setValue]);

  // Pre-select subject in update mode once liveSubjects loads
  useEffect(() => {
    if (type === "update" && data?.subjectId && liveSubjects.length > 0) {
      const sub = liveSubjects.find((s) => s.id === data.subjectId) ?? null;
      setSelectedSubject(sub);
      setValue("subjectId", data.subjectId as string);
    }
  }, [liveSubjects, type, data?.subjectId, setValue]);

  const studentOptions = useMemo(() => {
    if (!selectedSubject) return liveStudents;
    if (selectedSubject.classScope === "institution") return liveStudents;
    if (selectedSubject.classIds.length === 0) return liveStudents;
    return liveStudents.filter((s) =>
      selectedSubject.classIds.includes(s.classId ?? ""),
    );
  }, [selectedSubject, liveStudents]);

  const toggleComment = (num: number) => {
    setSelectedCommentNumbers((prev) => {
      let next: number[];
      if (prev.includes(num)) {
        next = prev.filter((n) => n !== num);
      } else if (prev.length < 5) {
        next = [...prev, num].sort((a, b) => a - b);
      } else {
        return prev;
      }
      setValue("commentNumbers", next, { shouldValidate: true });
      return next;
    });
  };

  const onSubmit = handleSubmit(async (formData) => {
    if (submitting) return;
    if (!institutionId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // The comment and its audit entry are written in ONE batch, so a comment
      // is never saved unrecorded. The entry names the student and subject, not
      // the comment text or conduct grade.
      const studentName =
        liveStudents.find((s) => s.uid === formData.studentId)?.name ??
        (data?.studentName as string | undefined) ??
        "";
      const subjectName = liveSubjects.find((s) => s.id === formData.subjectId)?.name ?? "";
      const termName = liveTerms.find((t) => t.id === formData.termId)?.name ?? "";
      const batch = writeBatch(db);

      if (type === "create") {
        const q = query(
          institutionCollection(institutionId, "feedback_comments"),
          where("studentId", "==", formData.studentId),
          where("teacherId", "==", user?.uid ?? ""),
          where("subjectId", "==", formData.subjectId),
          where("termId", "==", formData.termId),
        );
        const existingSnap = await getDocs(q);
        if (!existingSnap.empty) {
          batch.update(existingSnap.docs[0].ref, {
            conductGrade: formData.conductGrade,
            commentNumbers: formData.commentNumbers,
            subjectId: formData.subjectId,
          });
        } else {
          batch.set(doc(institutionCollection(institutionId, "feedback_comments")), {
            studentId: formData.studentId,
            classId: formData.classId,
            termId: formData.termId,
            subjectId: formData.subjectId,
            conductGrade: formData.conductGrade,
            commentNumbers: formData.commentNumbers,
            teacherId: user?.uid ?? "",
            institutionId,
            departmentId,
            studentName,
            teacherName,
            className:
              liveClasses.find((c) => c.id === formData.classId)?.name ?? "",
            termName,
            createdAt: serverTimestamp(),
          });
        }
      } else {
        const id = data?.id;
        if (typeof id !== "string") {
          console.log(
            "FeedbackCommentForm update: no string ID (mock mode)",
            formData,
          );
          return;
        }
        batch.update(
          institutionDoc(institutionId, "feedback_comments", id),
          {
            subjectId: formData.subjectId,
            conductGrade: formData.conductGrade,
            commentNumbers: formData.commentNumbers,
            // studentId, classId, termId intentionally excluded — locked context fields
          },
        );
      }

      if (user && institutionId !== "*") {
        batch.set(
          doc(institutionCollection(institutionId, "audit_log")),
          buildAuditEntry({
            institutionId,
            eventType: "comment_edit",
            detail: feedbackCommentDetail({ studentName, subjectName, termName }),
            targetUid: formData.studentId,
            targetName: studentName || "Student",
            performedBy: user.uid,
            performedByName: actorName(displayName, user.email, staffFallback(role)),
          }),
        );
      }

      await batch.commit();
      onClose?.();
    } catch (err) {
      console.error("FeedbackCommentForm submit error:", err);
      setSubmitError(
        "Failed to save. Please check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
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
          <label className="text-xs text-gray-500 dark:text-gray-300">
            Subject
          </label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("subjectId")}
            defaultValue={data?.subjectId as string | undefined}
            onChange={(e) => {
              setValue("subjectId", e.target.value);
              const sub =
                liveSubjects.find((s) => s.id === e.target.value) ?? null;
              setSelectedSubject(sub);
              setValue("studentId", "");
              setValue("classId", "");
              setStudentHasNoClass(false);
            }}
          >
            <option value="">Select a subject</option>
            {liveSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {errors.subjectId?.message && (
            <p className="text-xs text-red-400">
              {errors.subjectId.message.toString()}
            </p>
          )}
        </div>

        {/* Student */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">
            Student
          </label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("studentId")}
            defaultValue={data?.studentId as string | undefined}
            onChange={(e) => {
              setValue("studentId", e.target.value);
              const student = liveStudents.find(
                (s) => s.uid === e.target.value,
              );
              if (student) {
                if (student.classId) {
                  setValue("classId", student.classId);
                  setStudentHasNoClass(false);
                } else {
                  setValue("classId", "");
                  setStudentHasNoClass(true);
                }
              }
            }}
          >
            <option value="">Select a student</option>
            {studentOptions.map((s) => (
              <option key={s.uid} value={s.uid}>
                {s.name}
              </option>
            ))}
          </select>
          {errors.studentId?.message && (
            <p className="text-xs text-red-400">
              {errors.studentId.message.toString()}
            </p>
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
              Class{" "}
              <span className="text-orange-400">
                (student has no assigned class — select manually)
              </span>
            </label>
            <select
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
              onChange={(e) => setValue("classId", e.target.value)}
            >
              <option value="">Select a class</option>
              {liveClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.classId?.message && (
              <p className="text-xs text-red-400">
                {errors.classId.message.toString()}
              </p>
            )}
          </div>
        )}

        {/* Term */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">
            Term
          </label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("termId")}
            defaultValue={data?.termId as string | undefined}
          >
            <option value="">Select a term</option>
            {liveTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {errors.termId?.message && (
            <p className="text-xs text-red-400">
              {errors.termId.message.toString()}
            </p>
          )}
        </div>

        {/* Conduct Grade */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">
            Conduct Grade
          </label>
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
            <p className="text-xs text-red-400">
              {errors.conductGrade.message.toString()}
            </p>
          )}
        </div>

        {/* Comment Numbers — multi-select checkboxes (max 5) */}
        <div className="flex flex-col gap-2 w-full">
          <label className="text-xs text-gray-500 dark:text-gray-300">
            Comments{" "}
            <span className="text-gray-400 dark:text-gray-500">
              (select up to 5)
            </span>
          </label>
          {selectedCommentNumbers.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Selected: {selectedCommentNumbers.join(", ")}
            </p>
          )}
          <div className="ring-[1.5px] ring-gray-300 dark:ring-gray-600 rounded-md p-2 max-h-60 overflow-y-auto flex flex-col gap-1">
            {COMMENT_KEY.map((text, i) => {
              const num = i + 1;
              const isChecked = selectedCommentNumbers.includes(num);
              const isDisabled =
                !isChecked && selectedCommentNumbers.length >= 5;
              return (
                <label
                  key={num}
                  className={`flex items-start gap-2 text-sm py-1 px-1 rounded cursor-pointer select-none ${
                    isDisabled
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0 cursor-pointer"
                    checked={isChecked}
                    disabled={isDisabled}
                    onChange={() => !isDisabled && toggleComment(num)}
                  />
                  <span className="dark:text-gray-200">
                    <span className="font-medium">{num}.</span>{" "}
                    {renderComment(text, {
                      studentName: firstNameOf(selectedStudent?.name),
                      gender: selectedStudent?.gender,
                      subjectName: selectedSubject?.name,
                    })}
                  </span>
                </label>
              );
            })}
          </div>
          {errors.commentNumbers?.message && (
            <p className="text-xs text-red-400">
              {errors.commentNumbers.message.toString()}
            </p>
          )}
        </div>
      </div>
      {submitError && (
        <p className="text-xs text-red-500 text-center">{submitError}</p>
      )}
      <button
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
        disabled={submitting}
      >
        {submitting ? "Saving…" : type === "create" ? "Submit" : "Update"}
      </button>
    </form>
  );
};

export default FeedbackCommentForm;
