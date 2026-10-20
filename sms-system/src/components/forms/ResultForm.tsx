import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMissingRecordNotice } from "./MissingRecordNotice";
import { z } from "@/lib/zod";
import {
  collection, doc, getDoc, onSnapshot,
  query, serverTimestamp, where, writeBatch,
} from "firebase/firestore";
import InputField from "../InputField";
import ScopePickers from "./ScopePickers";
import { db, type GradingSystem } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";
import { actorName, buildAuditEntry, staffFallback } from "@/lib/auditLog";
import { resultDetail } from "@/lib/teacherAudit";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import { useOwnTeacherProfile } from "@/hooks/useOwnTeacherProfile";

const schema = z.object({
  studentId: z.string().min(1, "Student is required."),
  classId: z.string().min(1, "Class is required."),
  termId: z.string().min(1, "Term is required."),
  subjectId: z.string().min(1, "Subject is required."),
  assessmentType: z.enum(['coursework', 'exam'] as const, {
    message: "Assessment type is required.",
  }),
  assessmentName: z.string().min(1, "Assessment name is required.").max(100),
  score: z.coerce.number().min(0, "Score cannot be negative."),
  maxScore: z.coerce.number().min(1, "Max score must be at least 1."),
  weight: z.coerce.number().min(0).max(1).optional(),
  date: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.score > data.maxScore) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Score cannot exceed max score.",
      path: ["score"],
    });
  }
});

type FormData = Partial<Record<string, string | number | readonly string[] | undefined>>;

const ResultForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, institutionId, displayName } = useAuth();
  const [gradingSystem, setGradingSystem] = useState<GradingSystem>("flat");
  const { departmentId, teacherName } = useOwnTeacherProfile();
  const [liveStudents, setLiveStudents] = useState<{ uid: string; name: string; classId?: string }[]>([]);
  const { data: liveTerms = [] } = useInstitutionTerms();
  const { data: liveSubjects = [] } = useInstitutionSubjects();
  const { data: liveClasses = [] } = useInstitutionClasses();
  const [selectedSubject, setSelectedSubject] = useState<{ id: string; name: string; classScope: string; classIds: string[] } | null>(null);
  const [studentHasNoClass, setStudentHasNoClass] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
  });

  // Fetch the institution's grading system
  useEffect(() => {
    if (!institutionId) return;
    getDoc(doc(db, "institutions", institutionId)).then(
      (snap) => {
        if (snap.exists()) setGradingSystem(snap.data().gradingSystem ?? "flat");
      },
      onLoadError("the grading system"),
    );
  }, [institutionId]);

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
      onLoadError('the students to choose from'),
    );

    return unsubStudents;
  }, [institutionId, user, role]);

  // Pre-populate locked context fields in update mode
  useEffect(() => {
    if (type === 'update' && data) {
      if (data.studentId) setValue('studentId', data.studentId as string);
      if (data.classId) setValue('classId', data.classId as string);
      if (data.termId) setValue('termId', data.termId as string);
      if (data.assessmentType) setValue('assessmentType', data.assessmentType as 'coursework' | 'exam');
    }
  }, [type, data, setValue]);

  // Pre-populate student/classId in update mode once liveStudents loads
  useEffect(() => {
    if (type === 'update' && data?.studentId && liveStudents.length > 0) {
      setValue('studentId', data.studentId as string);
      const student = liveStudents.find((s) => s.uid === data.studentId as string);
      if (student?.classId) {
        setValue('classId', student.classId);
      }
    }
  }, [liveStudents, type, data?.studentId, setValue]);

  // Pre-populate term in update mode once liveTerms loads
  useEffect(() => {
    if (type === 'update' && data?.termId && liveTerms.length > 0) {
      setValue('termId', data.termId as string);
    }
  }, [liveTerms, type, data?.termId, setValue]);

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

  const missingId = useMissingRecordNotice();
  const onSubmit = handleSubmit(async (formData) => {
    if (!institutionId) return;
    try {
      // The result and its audit entry are written in ONE batch, so a result is
      // never saved unrecorded. The entry names the student, subject and
      // assessment, never the score.
      const studentName =
        liveStudents.find((s) => s.uid === formData.studentId)?.name ??
        (data?.studentName as string | undefined) ??
        "";
      const subjectName = liveSubjects.find((s) => s.id === formData.subjectId)?.name ?? "";
      const batch = writeBatch(db);

      if (type === "create") {
        const className = liveClasses.find((c) => c.id === formData.classId)?.name ?? "";
        batch.set(doc(institutionCollection(institutionId, "results")), {
          ...formData,
          teacherId: user?.uid ?? "",
          teacherName,
          studentName,
          className,
          institutionId,
          departmentId,
          createdAt: serverTimestamp(),
        });
      } else {
        const id = data?.id;
        if (typeof id !== "string") {
          missingId.show();
          return;
        }
        batch.update(institutionDoc(institutionId, "results", id), {
          subjectId: formData.subjectId,
          assessmentType: formData.assessmentType,
          assessmentName: formData.assessmentName,
          score: formData.score,
          maxScore: formData.maxScore,
          weight: formData.weight,
          date: formData.date,
          // studentId, classId, termId intentionally excluded — locked context fields
        });
      }

      if (user && institutionId !== "*") {
        batch.set(
          doc(institutionCollection(institutionId, "audit_log")),
          buildAuditEntry({
            institutionId,
            eventType: "results_edit",
            detail: resultDetail({
              studentName,
              subjectName,
              assessmentName: formData.assessmentName,
              created: type === "create",
            }),
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
      console.error("ResultForm submit error:", err);
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new result" : "Edit result"}
      </h1>
      <div className="flex justify-between flex-wrap gap-4">

        <ScopePickers
          register={register}
          setValue={setValue}
          errors={errors}
          data={data}
          subjects={liveSubjects}
          terms={liveTerms}
          classes={liveClasses}
          students={liveStudents}
          studentOptions={studentOptions}
          studentHasNoClass={studentHasNoClass}
          onSubjectChange={(id) => setSelectedSubject(liveSubjects.find((s) => s.id === id) ?? null)}
          onStudentChosen={(hasClass) => setStudentHasNoClass(!hasClass)}
        />

        <InputField
          label="Assessment Name"
          name="assessmentName"
          defaultValue={data?.assessmentName}
          register={register}
          error={errors.assessmentName}
        />

        {/* Assessment Type */}
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500 dark:text-gray-300">Assessment Type</label>
          <select
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100"
            {...register("assessmentType")}
            defaultValue={data?.assessmentType as string | undefined}
          >
            <option value="">Select type</option>
            <option value="coursework">Course Work</option>
            <option value="exam">Exam / Test</option>
          </select>
          {errors.assessmentType?.message && (
            <p className="text-xs text-red-400">{errors.assessmentType.message.toString()}</p>
          )}
        </div>

        <InputField
          label="Score"
          name="score"
          type="number"
          defaultValue={data?.score}
          register={register}
          error={errors.score}
        />
        <InputField
          label="Max Score"
          name="maxScore"
          type="number"
          defaultValue={data?.maxScore}
          register={register}
          error={errors.maxScore}
        />
        {gradingSystem === "weighted" && (
          <InputField
            label="Weight (0–1)"
            name="weight"
            type="number"
            defaultValue={data?.weight}
            register={register}
            error={errors.weight}
          />
        )}
        <InputField
          label="Date"
          name="date"
          type="date"
          defaultValue={data?.date}
          register={register}
          error={errors.date}
        />
      </div>
      {missingId.notice}
      <button className="bg-blue-400 text-white p-2 rounded-md">
        {type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default ResultForm;
