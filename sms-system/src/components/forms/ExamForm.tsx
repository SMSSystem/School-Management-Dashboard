import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMissingRecordNotice } from "./MissingRecordNotice";
import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import InputField from "../InputField";
import NoDepartmentNotice from "../NoDepartmentNotice";
import TermSubjectClassTeacherFields from "./TermSubjectClassTeacherFields";
import FormSection from "./exam/FormSection";
import ExamTypeFields from "./exam/ExamTypeFields";
import OnlineExamFields from "./exam/OnlineExamFields";
import { examSchema } from "./exam/examFormSchema";
import { classOptionsFor, teacherOptionsFor } from "@/lib/assignmentFormLogic";
import { estimateExamWrites, studentsInClass } from "@/lib/examBudget";
import {
  formLocks,
  newOnlineDefaults,
  onlineFields,
  onlineValuesFromExam,
  plainExamLabels,
  windowDefaults,
  type ExamOnlineFormValues,
} from "@/lib/examFormLogic";
import { actorName, buildAuditEntry, staffFallback } from "@/lib/auditLog";
import { examEditDetail } from "@/lib/teacherAudit";
import { copyExamContent } from "@/lib/examContent";
import { useMyDepartment } from "@/hooks/useMyDepartment";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import { useTeachersMeta } from "@/hooks/useTeachersMeta";
import { EXAM_LIMITS, type ExamReleaseMode } from "@/types/exams";

type FormData = Partial<
  Record<string, string | number | readonly string[] | undefined>
>;

const ExamForm = ({
  type,
  data,
  onClose,
}: {
  type: "create" | "update";
  data?: FormData;
  onClose?: () => void;
}) => {
  const { user, role, institutionId, displayName } = useAuth();
  const { departmentId: myDepartmentId } = useMyDepartment();
  const isTeacherRole = role === "senior_teacher" || role === "regular_teacher";
  // The saved exam, for the online fields (the list hands the whole document to the form).
  const saved = type === "update" ? (data as Record<string, unknown> | undefined) : undefined;
  const locks = formLocks(saved as { status?: string; questionCount?: number } | undefined);
  const alreadyOnline = saved?.online === true;
  // Duplicate: the form opens as a create, filled in from another exam, and that exam's questions and key are copied
  // onto the new draft once it has been created (the rules read the exam before they allow a write under it, so the
  // copy is a second step).
  const duplicateOf = type === "create" && typeof data?.duplicateOf === "string" ? data.duplicateOf : undefined;
  const prefill = saved ?? (duplicateOf ? (data as Record<string, unknown>) : undefined);
  const retryCopy = useRef<{ examId: string; title: string; className?: string; subjectName?: string } | null>(null);

  const { data: rawTerms = [] } = useInstitutionTerms();
  const terms = useMemo(
    () => [...rawTerms].sort((a, b) => a.name.localeCompare(b.name)),
    [rawTerms],
  );
  const { data: subjects = [] } = useInstitutionSubjects();
  const { data: classes = [] } = useInstitutionClasses();
  // teacherId -> departmentId, needed at write time: the deployed `exams` rule lets a senior_teacher edit any exam
  // in their department via this field. Shared and cached (hooks/useTeachersMeta.ts), not read per opening.
  const teachersMeta = useTeachersMeta();
  const departmentByTeacherId = useMemo<Record<string, string | undefined>>(
    () => Object.fromEntries(Object.entries(teachersMeta).map(([id, m]) => [id, m.departmentId])),
    [teachersMeta],
  );
  const [ownName, setOwnName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const awaitingConflictConfirm = useRef(false);
  // The opening and closing times follow the date, start time and duration until the person edits them (and never
  // for an exam that already has a window).
  const windowEdited = useRef(false);

  const onlineDefaults: ExamOnlineFormValues = prefill ? onlineValuesFromExam(prefill) : newOnlineDefaults();
  if (saved && onlineDefaults.opensAt) windowEdited.current = true;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(examSchema),
    defaultValues: {
      termId: (data?.termId as string | undefined) ?? "",
      subjectId: (data?.subjectId as string | undefined) ?? "",
      classId: (data?.classId as string | undefined) ?? "",
      teacherId: (data?.teacherId as string | undefined) ?? "",
      date: (data?.date as string | undefined) ?? "",
      startTime: (data?.startTime as string | undefined) ?? "",
      room: (data?.room as string | undefined) ?? "",
      ...onlineDefaults,
    },
  });

  const watchedSubjectId = watch("subjectId");
  const selectedSubject = subjects.find((s) => s.id === watchedSubjectId);
  const watchedClassId = watch("classId");
  const watchedDate = watch("date");
  const watchedStartTime = watch("startTime");
  const watchedDuration = watch("duration");
  const watchedOnline = watch("online");
  const watchedValueType = watch("valueType");
  const watchedCategory = watch("categoryType");
  const watchedAnswerMode = watch("answerMode");
  const watchedReleaseMode = watch("releaseMode");
  const watchedCheckpoint = watch("checkpointMinutes");
  const watchedIntegrity = watch("integrity");

  // Locked teacher display: own name on create, whoever's already on the
  // document (not necessarily self) on update — never silently reassigns.
  const lockedTeacherId =
    type === "update" && data?.teacherId
      ? String(data.teacherId)
      : (user?.uid ?? "");
  const lockedTeacherName =
    type === "update" && data?.teacherName ? String(data.teacherName) : ownName;

  useEffect(() => {
    if (!isTeacherRole || !user || type === "update") return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setOwnName((snap.data().name as string) ?? "");
    }, onLoadError("your name"));
  }, [isTeacherRole, user, type]);

  useEffect(() => {
    if (isTeacherRole && lockedTeacherId) {
      setValue("teacherId", lockedTeacherId, { shouldValidate: true });
    }
  }, [isTeacherRole, lockedTeacherId, setValue]);

  // A conflict warning (and the "submit again to confirm" bypass it grants)
  // is only ever meant to apply to the exact class/date combination it was
  // raised for. If either changes, the bypass must not silently carry over
  // to a combination that was never actually checked.
  useEffect(() => {
    awaitingConflictConfirm.current = false;
    setConflictWarning(null);
  }, [watchedClassId, watchedDate]);

  // Ticking "Online exam" makes the category Multiple Choice (the only one that can be chosen yet).
  useEffect(() => {
    if (watchedOnline && !watchedCategory) setValue("categoryType", "multiple_choice");
  }, [watchedOnline, watchedCategory, setValue]);

  useEffect(() => {
    if (!watchedOnline || windowEdited.current) return;
    const w = windowDefaults(watchedDate, watchedStartTime, watchedDuration ?? "");
    if (w) {
      setValue("opensAt", w.opensAt);
      setValue("closesAt", w.closesAt);
    }
  }, [watchedOnline, watchedDate, watchedStartTime, watchedDuration, setValue]);

  const classOptions = classOptionsFor(selectedSubject, classes);
  const teacherOptions = teacherOptionsFor(selectedSubject);

  const students = studentsInClass(classes.find((c) => c.id === watchedClassId));
  const budget = watchedOnline
    ? estimateExamWrites({
        students: students ?? 1,
        durationMinutes: Number(watchedDuration) || 0,
        checkpointMinutes: Number(watchedCheckpoint) || EXAM_LIMITS.defaultCheckpointMinutes,
        releaseMode: (watchedReleaseMode as ExamReleaseMode) || "manual",
        // The pictures the exam already has (an update, or the exam being duplicated).
        imagePacks: typeof prefill?.imagePacks === "number" ? prefill.imagePacks : undefined,
        imageBytes: typeof prefill?.imageBytes === "number" ? prefill.imageBytes : undefined,
      })
    : null;

  const missingId = useMissingRecordNotice();
  const actor = user ? { uid: user.uid, name: actorName(displayName, user.email, staffFallback(role)) } : null;
  const copyQuestions = async (target: { examId: string; title: string; className?: string; subjectName?: string }) => {
    if (!duplicateOf || !institutionId || !actor) return;
    try {
      await copyExamContent({
        institutionId,
        sourceExamId: duplicateOf,
        newExamId: target.examId,
        exam: target,
        actor,
      });
      retryCopy.current = null;
      onClose?.();
    } catch (err) {
      retryCopy.current = target;
      setSubmitError(
        `The exam was created, but its questions could not be copied (${err instanceof Error ? err.message : "unknown error"}). Press Create to try copying them again, or add them in the builder.`,
      );
    }
  };

  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    // The exam was already created and only the copy of its questions failed: try that again, not a second exam.
    if (retryCopy.current) {
      await copyQuestions(retryCopy.current);
      return;
    }

    if (!awaitingConflictConfirm.current) {
      const editId = type === "update" ? String(data?.id ?? "") : "";
      if (!institutionId) return;
      const snap = await getDocs(
        query(
          institutionCollection(institutionId, "exams"),
          where("classId", "==", formData.classId),
          where("date", "==", formData.date),
        ),
      );
      const conflict = snap.docs.find((d) => d.id !== editId);
      if (conflict) {
        const c = conflict.data();
        setConflictWarning(
          `This class already has "${c.subjectName as string}" scheduled as an exam on this date. Submit again to save anyway.`,
        );
        awaitingConflictConfirm.current = true;
        return;
      }
    }

    setConflictWarning(null);
    awaitingConflictConfirm.current = false;

    try {
      const term = terms.find((t) => t.id === formData.termId);
      const cls = classes.find((c) => c.id === formData.classId);
      const teacherId = isTeacherRole
        ? lockedTeacherId
        : String(formData.teacherId ?? "");
      const teacherName = isTeacherRole
        ? lockedTeacherName
        : (teacherOptions.find((t) => t.id === teacherId)?.name ?? "");
      // When the signed-in teacher is the author, their own users doc is the
      // source: it's always readable by its owner. The all-teachers query
      // below is rejected by the `users` read rule for any teacher-role caller
      // (ISSUES_AND_GAPS.md #37), so departmentByTeacherId stays empty for them
      // and a teacher's own exam would otherwise never get a departmentId —
      // even a teacher who has one.
      const ownDepartmentId =
        teacherId === user?.uid ? (myDepartmentId ?? undefined) : undefined;
      const departmentId =
        ownDepartmentId ??
        departmentByTeacherId[teacherId] ??
        (type === "update"
          ? (data?.departmentId as string | undefined)
          : undefined);
      const durationNum = formData.duration
        ? Number(formData.duration)
        : undefined;

      const values: ExamOnlineFormValues = { ...formData, duration: formData.duration ?? "" };
      const payload = {
        institutionId,
        termId: formData.termId,
        termName: term?.name ?? "",
        subjectId: formData.subjectId,
        subjectName: selectedSubject?.name ?? "",
        classId: formData.classId,
        className: cls?.name ?? "",
        teacherId,
        teacherName,
        ...(departmentId && { departmentId }),
        date: formData.date,
        ...(formData.startTime && { startTime: formData.startTime }),
        ...(durationNum && !isNaN(durationNum) && { duration: durationNum }),
        ...(formData.room && { room: formData.room }),
        ...(formData.online ? onlineFields(values, saved) : plainExamLabels(values)),
      };

      if (!institutionId) return;
      const id = data?.id;
      if (type === "update" && typeof id !== "string") {
        missingId.show();
        return;
      }

      if (formData.online) {
        // An online exam is saved with its audit entry in one batch.
        const batch = writeBatch(db);
        const newExamRef = type === "create" ? doc(institutionCollection(institutionId, "exams")) : null;
        if (newExamRef) {
          batch.set(newExamRef, {
            ...payload,
            createdBy: user?.uid ?? "",
            createdByRole: role ?? "",
            createdAt: serverTimestamp(),
          });
        } else {
          batch.update(institutionDoc(institutionId, "exams", id as string), payload);
        }
        if (institutionId !== "*" && user) {
          batch.set(
            doc(institutionCollection(institutionId, "audit_log")),
            buildAuditEntry({
              institutionId,
              eventType: "exam_edit",
              detail: examEditDetail({
                title: formData.title,
                className: cls?.name,
                subjectName: selectedSubject?.name,
                created: type === "create",
              }),
              targetUid: formData.classId,
              targetName: cls?.name || formData.title,
              performedBy: user.uid,
              performedByName: actorName(displayName, user.email, staffFallback(role)),
            }),
          );
        }
        await batch.commit();
        if (duplicateOf && newExamRef) {
          await copyQuestions({ examId: newExamRef.id, title: formData.title, className: cls?.name, subjectName: selectedSubject?.name });
          return;
        }
      } else if (type === "create") {
        await addDoc(institutionCollection(institutionId, "exams"), {
          ...payload,
          createdBy: user?.uid ?? "",
          createdByRole: role ?? "",
          createdAt: serverTimestamp(),
        });
      } else {
        await updateDoc(institutionDoc(institutionId, "exams", id as string), payload);
      }
      onClose?.();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to save exam.",
      );
    }
  });

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {duplicateOf ? "Duplicate exam" : type === "create" ? "Create a new exam" : "Edit exam"}
      </h1>
      <NoDepartmentNotice />
      {locks.readOnly && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          This exam is finalized and can no longer be edited.
        </p>
      )}

      <FormSection title="Exam details">
        <TermSubjectClassTeacherFields
          register={register}
          setValue={setValue}
          errors={errors}
          terms={terms}
          subjects={subjects}
          classOptions={classOptions}
          teacherOptions={teacherOptions}
          isTeacherRole={isTeacherRole}
          lockedTeacherName={lockedTeacherName}
          variant="roomy"
        />
        <InputField label="Date" name="date" type="date" register={register} error={errors.date} variant="roomy" />
        <InputField label="Start Time (optional)" name="startTime" type="time" register={register} error={errors.startTime} variant="roomy" />
        <InputField
          label="Duration (minutes)"
          hint={
            watchedOnline
              ? `Required: ${EXAM_LIMITS.minDurationMinutes} to ${EXAM_LIMITS.maxDurationMinutes} minutes.`
              : "Optional."
          }
          name="duration"
          type="number"
          inputProps={{ min: 1, max: 480 }}
          register={register}
          error={errors.duration}
          variant="roomy"
        />
        <InputField label="Room (optional)" name="room" register={register} error={errors.room} variant="roomy" />
      </FormSection>

      <FormSection title="Type">
        <ExamTypeFields
          register={register}
          errors={errors}
          valueType={watchedValueType}
          categoryType={watchedCategory}
          answerMode={watchedAnswerMode}
          lockCategoryAndMode={locks.lockCategoryAndMode}
          online={watchedOnline}
        />
      </FormSection>

      <OnlineExamFields
        register={register}
        errors={errors}
        online={watchedOnline}
        alreadyOnline={alreadyOnline}
        answerMode={watchedAnswerMode}
        releaseMode={watchedReleaseMode}
        integrity={watchedIntegrity}
        published={saved?.status === "published"}
        budget={budget}
        students={students}
        onWindowEdited={() => {
          windowEdited.current = true;
        }}
      />

      {conflictWarning && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{conflictWarning}</p>
      )}
      {submitError && <p className="text-xs text-red-500">{submitError}</p>}

      {missingId.notice}
      <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
        <button
          type="button"
          onClick={() => onClose?.()}
          className="rounded-md px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700"
        >
          {locks.readOnly ? "Close" : "Cancel"}
        </button>
        {!locks.readOnly && (
          <button
            className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving…" : type === "create" ? "Create" : "Update"}
          </button>
        )}
      </div>
    </form>
  );
};

export default ExamForm;
