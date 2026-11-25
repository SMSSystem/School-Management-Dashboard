import { useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormSetValue } from "react-hook-form";
import type { User } from "firebase/auth";
import { useMissingRecordNotice } from "./MissingRecordNotice";
import {
  addDoc,
  doc,
  type DocumentReference,
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
import { examSchema, type ExamFormValues } from "./exam/examFormSchema";
import { assignmentNames, classOptionsFor, saveErrorMessage, teacherOptionsFor, updateIdFor } from "@/lib/assignmentFormLogic";
import { studentsInClass } from "@/lib/examBudget";
import {
  durationHint,
  examBudgetFor,
  examDefaultValues,
  buildExamPayload,
  examEditId,
  examFormMode,
  resolveExamTeacher,
  windowDefaults,
} from "@/lib/examFormLogic";
import { actorName, buildAuditEntry, staffFallback } from "@/lib/auditLog";
import { examEditDetail } from "@/lib/teacherAudit";
import { copyExamContent, type ExamActor } from "@/lib/examContent";
import { useMyDepartment } from "@/hooks/useMyDepartment";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { useAssignmentFormLists } from "@/hooks/useAssignmentFormLists";
import { useTeachersMeta } from "@/hooks/useTeachersMeta";
import { useLockedTeacher } from "@/hooks/useLockedTeacher";

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
  const { saved, locks, alreadyOnline, duplicateOf, prefill, onlineDefaults, hasWindow } = examFormMode(type, data);

  const { terms, subjects, classes } = useAssignmentFormLists();
  const departmentByTeacherId = useDepartmentByTeacherId();
  const [submitError, setSubmitError] = useState<string | null>(null);


  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(examSchema),
    defaultValues: examDefaultValues(data, onlineDefaults),
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
  const { lockedTeacherId, lockedTeacherName } = useLockedTeacher({
    user,
    isTeacherRole,
    type,
    data,
    setTeacherId: (id) => setValue("teacherId", id, { shouldValidate: true }),
  });

  const { conflictWarning, stopForClash } = useExamConflict(watchedClassId, watchedDate);
  const windowEdited = useExamWindowDefaults({ hasWindow, watchedOnline, watchedCategory, watchedDate, watchedStartTime, watchedDuration, setValue });

  const classOptions = classOptionsFor(selectedSubject, classes);
  const teacherOptions = teacherOptionsFor(selectedSubject);

  const students = studentsInClass(classes.find((c) => c.id === watchedClassId));
  const budget = watchedOnline
    ? examBudgetFor({ students, duration: watchedDuration, checkpoint: watchedCheckpoint, releaseMode: watchedReleaseMode, prefill })
    : null;

  const missingId = useMissingRecordNotice();
  const actor = examActor(user, displayName, role);
  const { retryCopy, copyQuestions } = useExamDuplicateCopy({ duplicateOf, institutionId, actor, onClose, setSubmitError });

  const onSubmit = handleSubmit(async (formData) => {
    setSubmitError(null);
    // The exam was already created and only the copy of its questions failed: try that again, not a second exam.
    if (retryCopy.current) {
      await copyQuestions(retryCopy.current);
      return;
    }
    if (!institutionId) return;
    if (await stopForClash(institutionId, formData.classId, formData.date, examEditId(type, data))) return;

    const id = updateIdFor(type, data);
    if (id === null) {
      missingId.show();
      return;
    }

    try {
      const names = assignmentNames(formData, terms, classes, selectedSubject);
      const teacher = resolveExamTeacher({
        isTeacherRole,
        lockedTeacherId,
        lockedTeacherName,
        formTeacherId: formData.teacherId,
        teacherOptions,
        userUid: user?.uid,
        myDepartmentId,
        departmentByTeacherId,
        type,
        data,
      });
      const payload = buildExamPayload({
        institutionId,
        formData,
        ...names,
        teacher,
        saved,
      });
      const newExamRef = await saveExam({
        institutionId,
        type,
        id,
        payload,
        online: Boolean(formData.online),
        user,
        role,
        audit: { title: formData.title, classId: formData.classId, className: names.className, subjectName: names.subjectName, displayName },
      });
      if (duplicateOf && newExamRef) {
        await copyQuestions({ examId: newExamRef.id, title: formData.title, className: names.className, subjectName: names.subjectName });
        return;
      }
      onClose?.();
    } catch (err) {
      setSubmitError(saveErrorMessage(err, "Failed to save exam."));
    }
  });

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {examFormHeading(duplicateOf, type)}
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
          values={{ termId: watch("termId"), subjectId: watchedSubjectId, classId: watchedClassId, teacherId: watch("teacherId") }}
        />
        <InputField label="Date" name="date" type="date" register={register} error={errors.date} variant="roomy" />
        <InputField label="Start Time (optional)" name="startTime" type="time" register={register} error={errors.startTime} variant="roomy" />
        <InputField
          label="Duration (minutes)"
          hint={durationHint(watchedOnline)}
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

      <ExamFormMessages conflictWarning={conflictWarning} submitError={submitError} />

      {missingId.notice}
      <ExamFormActions locks={locks} type={type} isSubmitting={isSubmitting} onClose={onClose} />
    </form>
  );
};


type ExamFormInput = ExamFormValues;
type CopyTarget = { examId: string; title: string; className?: string; subjectName?: string };

// teacherId -> departmentId, needed at write time: the deployed `exams` rule lets a senior_teacher edit any exam
// in their department via this field. Shared and cached (hooks/useTeachersMeta.ts), not read per opening.
function useDepartmentByTeacherId(): Record<string, string | undefined> {
  const teachersMeta = useTeachersMeta();
  return useMemo<Record<string, string | undefined>>(
    () => Object.fromEntries(Object.entries(teachersMeta).map(([id, m]) => [id, m.departmentId])),
    [teachersMeta],
  );
}

// A conflict warning (and the "submit again to confirm" bypass it grants)
// is only ever meant to apply to the exact class/date combination it was
// raised for. If either changes, the bypass must not silently carry over
// to a combination that was never actually checked.
function useExamConflict(watchedClassId: string, watchedDate: string) {
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const awaitingConflictConfirm = useRef(false);
  useEffect(() => {
    awaitingConflictConfirm.current = false;
    setConflictWarning(null);
  }, [watchedClassId, watchedDate]);
  // True when the save must stop: a clash was found and warned about. Submitting again saves anyway.
  const stopForClash = async (institutionId: string, classId: string, date: string, editId: string): Promise<boolean> => {
    if (!awaitingConflictConfirm.current) {
      const clash = await findExamConflict(institutionId, classId, date, editId);
      if (clash) {
        setConflictWarning(clash);
        awaitingConflictConfirm.current = true;
        return true;
      }
    }
    setConflictWarning(null);
    awaitingConflictConfirm.current = false;
    return false;
  };
  return { conflictWarning, stopForClash };
}

function useExamWindowDefaults(p: {
  watchedOnline: boolean | undefined;
  watchedCategory: string | undefined;
  watchedDate: string;
  watchedStartTime: string | undefined;
  watchedDuration: string | undefined;
  setValue: UseFormSetValue<ExamFormInput>;
  hasWindow: boolean;
}) {
  const { watchedOnline, watchedCategory, watchedDate, watchedStartTime, watchedDuration, setValue } = p;
  // The opening and closing times follow the date, start time and duration until the person edits them (and never
  // for an exam that already has a window).
  const windowEdited = useRef(false);
  if (p.hasWindow) windowEdited.current = true;
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
  return windowEdited;
}

// Copies a duplicated exam's questions and key onto the new draft; a failed copy is kept to try again on the next Create.
function useExamDuplicateCopy(p: {
  duplicateOf: string | undefined;
  institutionId: string | null;
  actor: ExamActor | null;
  onClose?: () => void;
  setSubmitError: (message: string | null) => void;
}) {
  const retryCopy = useRef<CopyTarget | null>(null);
  const copyQuestions = async (target: CopyTarget) => {
    if (!p.duplicateOf || !p.institutionId || !p.actor) return;
    try {
      await copyExamContent({
        institutionId: p.institutionId,
        sourceExamId: p.duplicateOf,
        newExamId: target.examId,
        exam: target,
        actor: p.actor,
      });
      retryCopy.current = null;
      p.onClose?.();
    } catch (err) {
      retryCopy.current = target;
      p.setSubmitError(
        `The exam was created, but its questions could not be copied (${err instanceof Error ? err.message : "unknown error"}). Press Create to try copying them again, or add them in the builder.`,
      );
    }
  };
  return { retryCopy, copyQuestions };
}

/** Another exam already scheduled for this class on this date (not the one being edited): its clash warning, or null. */
async function findExamConflict(institutionId: string, classId: string, date: string, editId: string): Promise<string | null> {
  const snap = await getDocs(
    query(
      institutionCollection(institutionId, "exams"),
      where("classId", "==", classId),
      where("date", "==", date),
    ),
  );
  const conflict = snap.docs.find((d) => d.id !== editId);
  if (!conflict) return null;
  return `This class already has "${conflict.data().subjectName as string}" scheduled as an exam on this date. Submit again to save anyway.`;
}

/**
 * Saves the exam. An online exam is saved with its audit entry in one batch; a plain one as before. Returns the new
 * exam's reference when an online exam was created (a duplicate's questions are copied onto it next), else null.
 */
async function saveExam(p: {
  institutionId: string;
  type: "create" | "update";
  id: unknown;
  payload: Record<string, unknown>;
  online: boolean;
  user: User | null;
  role: string | null;
  audit: { title: string; classId: string; className?: string; subjectName?: string; displayName: string | null };
}): Promise<DocumentReference | null> {
  const { institutionId, type, id, payload, user, role } = p;
  if (p.online) {
    // An online exam is saved with its audit entry in one batch.
    const batch = writeBatch(db);
    const newExamRef = type === "create" ? doc(institutionCollection(institutionId, "exams")) : null;
    if (newExamRef) {
      batch.set(newExamRef, { ...payload, ...createdFields(user, role) });
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
            title: p.audit.title,
            className: p.audit.className,
            subjectName: p.audit.subjectName,
            created: type === "create",
          }),
          targetUid: p.audit.classId,
          targetName: p.audit.className || p.audit.title,
          performedBy: user.uid,
          performedByName: actorName(p.audit.displayName, user.email, staffFallback(role)),
        }),
      );
    }
    await batch.commit();
    return newExamRef;
  }
  if (type === "create") {
    await addDoc(institutionCollection(institutionId, "exams"), { ...payload, ...createdFields(user, role) });
  } else {
    await updateDoc(institutionDoc(institutionId, "exams", id as string), payload);
  }
  return null;
}

function examActor(user: User | null, displayName: string | null, role: string | null): ExamActor | null {
  return user ? { uid: user.uid, name: actorName(displayName, user.email, staffFallback(role)) } : null;
}

function examFormHeading(duplicateOf: string | undefined, type: "create" | "update"): string {
  return duplicateOf ? "Duplicate exam" : type === "create" ? "Create a new exam" : "Edit exam";
}

function ExamFormMessages({ conflictWarning, submitError }: { conflictWarning: string | null; submitError: string | null }) {
  return (
    <>
      {conflictWarning && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{conflictWarning}</p>
      )}
      {submitError && <p className="text-xs text-red-500">{submitError}</p>}
    </>
  );
}

// Cancel (Close on a finalized exam, which can't be saved) and Create or Update.
function ExamFormActions({
  locks,
  type,
  isSubmitting,
  onClose,
}: {
  locks: { readOnly: boolean };
  type: "create" | "update";
  isSubmitting: boolean;
  onClose?: () => void;
}) {
  return (
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
  );
}

/** Who made a new exam, and when. */
function createdFields(user: User | null, role: string | null) {
  return { createdBy: user?.uid ?? "", createdByRole: role ?? "", createdAt: serverTimestamp() };
}

export default ExamForm;
