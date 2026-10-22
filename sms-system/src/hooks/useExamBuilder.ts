import { useCallback, useEffect, useMemo, useState } from "react";
import { getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { institutionDoc } from "@/lib/paths";
import { actorName, staffFallback } from "@/lib/auditLog";
import { describeError, classifyError, reportError } from "@/lib/reportError";
import { canManageExam, canViewExamContent } from "@/lib/examAccess";
import {
  applyKeyCorrections,
  draftChanged,
  editMode,
  groupIssues,
  joinDraft,
  splitDraft,
  type BuilderQuestion,
  type EditMode,
} from "@/lib/examBuilderLogic";
import { ExamConflictError, countExamAttempts, loadExamContent, saveExamContent, setExamStatus } from "@/lib/examContent";
import { checkDayBudget, type DayCheck } from "@/lib/examDayLoad";
import { onlineValuesFromExam, settingsFromForm, toLocalInput } from "@/lib/examFormLogic";
import { millisOf } from "@/lib/examListLogic";
import { validateKey, validateQuestions, type ExamIssue } from "@/lib/examKeyValidation";
import { canTransition, publishBlockers } from "@/lib/examSettings";
import type { ExamStatusAction } from "@/lib/teacherAudit";
import type { ExamDocument, ExamStatus } from "@/types/exams";

export type BuilderExam = ExamDocument & { id: string };

export type BuilderNotice = { kind: "ok" | "error"; text: string };

const formatWindow = (opens?: number, closes?: number): string | undefined =>
  opens !== undefined && closes !== undefined ? `${toLocalInput(opens).replace("T", " ")} to ${toLocalInput(closes).replace("T", " ")}` : undefined;

// Everything the exam builder page needs (EXAMS_FEATURE_SPEC.md §4.2 and §4.3): the exam and its saved content, the
// list being edited, what may be edited right now, the issues, and the save and status actions. Content is read
// once on opening (the questions, the key and, for a published exam, a count of its attempts) and again after each
// change; nothing listens live.
export function useExamBuilder(examId: string | undefined) {
  const { user, role, institutionId, displayName, departmentId } = useAuth();
  const [exam, setExam] = useState<BuilderExam | null>(null);
  const [saved, setSaved] = useState<BuilderQuestion[]>([]);
  const [draft, setDraft] = useState<BuilderQuestion[]>([]);
  const [questionsRevision, setQuestionsRevision] = useState(0);
  const [hasAttempts, setHasAttempts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<BuilderNotice | null>(null);

  const person = useMemo(() => ({ uid: user?.uid, role, departmentId }), [user?.uid, role, departmentId]);

  // keepDraft: reload what is saved but leave the list being edited alone (a status change must not lose edits).
  const load = useCallback(async (keepDraft = false) => {
    if (!examId || !institutionId || institutionId === "*") {
      setError("This exam could not be found.");
      setLoading(false);
      return;
    }
    try {
      const snap = await getDoc(institutionDoc(institutionId, "exams", examId));
      if (!snap.exists()) {
        setError("This exam could not be found.");
        return;
      }
      const loaded = { id: snap.id, ...snap.data() } as BuilderExam;
      setExam(loaded);
      if (loaded.online !== true) {
        setError("This exam is not an online exam, so it has no questions to build.");
        return;
      }
      if (!canViewExamContent(loaded, person)) {
        setError("You do not have access to this exam's questions.");
        return;
      }
      const [content, attempts] = await Promise.all([
        loadExamContent(institutionId, examId),
        loaded.status === "published" ? countExamAttempts(institutionId, examId) : Promise.resolve(0),
      ]);
      const list = joinDraft(content.questions?.items ?? [], content.key?.answers);
      setSaved(list);
      if (!keepDraft) setDraft(list);
      setQuestionsRevision(content.questions?.revision ?? 0);
      setHasAttempts(attempts > 0);
      setError(null);
    } catch (err) {
      reportError(err, { what: "the exam" });
      setError(describeError(classifyError(err), "the exam"));
    } finally {
      setLoading(false);
    }
  }, [examId, institutionId, person]);

  useEffect(() => {
    void load();
  }, [load]);

  const canManage = !!exam && canManageExam(exam, person);
  const mode: EditMode = !exam || !canManage
    ? "read_only"
    : editMode(
        { status: exam.status, opensAtMs: millisOf(exam.opensAt) },
        { hasAttempts, nowMs: Date.now() },
      );

  const dirty = draftChanged(saved, draft);
  const draftSplit = useMemo(() => splitDraft(draft), [draft]);
  const issues: ExamIssue[] = useMemo(
    () => [...validateQuestions(draftSplit.questions, exam?.answerMode), ...validateKey(draftSplit.questions, draftSplit.answers)],
    [draftSplit, exam?.answerMode],
  );
  const grouped = useMemo(() => groupIssues(issues), [issues]);

  const actor = user ? { uid: user.uid, name: actorName(displayName, user.email, staffFallback(role)) } : null;

  async function save(): Promise<boolean> {
    if (!exam || !institutionId || !actor || busy) return false;
    setBusy(true);
    setNotice(null);
    try {
      const draftToSave = mode === "key_only" ? applyKeyCorrections(saved, draft) : draft;
      await saveExamContent({
        institutionId,
        examId: exam.id,
        exam: { title: exam.title ?? "", className: exam.className, subjectName: exam.subjectName, keyRevision: exam.keyRevision },
        draft: draftToSave,
        savedAnswers: splitDraft(saved).answers,
        questionsRevision,
        mode,
        actor,
      });
      await load();
      setNotice({ kind: "ok", text: mode === "key_only" ? "Answer key saved. Existing grades will show Re-grade needed." : "Saved." });
      return true;
    } catch (err) {
      reportError(err, { what: "the exam questions", quiet: true });
      setNotice({ kind: "error", text: err instanceof ExamConflictError ? err.message : describeError(classifyError(err), "the exam questions") });
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** What stops this exam from being published, from the saved content and settings (empty when it can be). */
  function blockers(): ExamIssue[] {
    if (!exam) return [];
    const settings = settingsFromForm(onlineValuesFromExam(exam as unknown as Record<string, unknown>));
    const { questions, answers } = splitDraft(saved);
    return publishBlockers(settings, questions, answers, Date.now());
  }

  /**
   * The online exams of this exam's day added up against the Exams feature's daily budget (examDayBudget.ts), before it is
   * published or reopened. Null when it cannot be worked out (no date, or the read failed): the guard is advisory, so the
   * publish then goes on to its normal confirmation.
   */
  async function checkDay(): Promise<DayCheck | null> {
    if (!exam || !institutionId) return null;
    try {
      return await checkDayBudget({
        institutionId,
        examId: exam.id,
        exam,
        isAdmin: role === "institution_admin" || role === "super_admin",
      });
    } catch (err) {
      reportError(err, { what: "the day's exam load", quiet: true });
      return null;
    }
  }

  async function changeStatus(to: ExamStatus, action: ExamStatusAction): Promise<boolean> {
    if (!exam || !institutionId || !actor || busy) return false;
    setBusy(true);
    setNotice(null);
    try {
      await setExamStatus({
        institutionId,
        examId: exam.id,
        exam: {
          title: exam.title ?? "",
          className: exam.className,
          subjectName: exam.subjectName,
          status: exam.status ?? "draft",
          closesAtMs: millisOf(exam.closesAt),
          window: formatWindow(millisOf(exam.opensAt), millisOf(exam.closesAt)),
        },
        to,
        action,
        actor,
      });
      await load(true);
      setNotice({ kind: "ok", text: STATUS_DONE[action] });
      return true;
    } catch (err) {
      reportError(err, { what: "the exam status", quiet: true });
      setNotice({
        kind: "error",
        text: err instanceof Error && err.message.startsWith("A student") ? err.message : describeError(classifyError(err), "the exam status"),
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Which status buttons apply now (the status graph, with the clock; going back to a draft is checked on click). */
  function availableActions(): { to: ExamStatus; action: ExamStatusAction; label: string }[] {
    if (!exam || !canManage) return [];
    const nowMs = Date.now();
    const status = exam.status ?? "draft";
    const ctx = { hasAttempts: false, nowMs, closesAtMs: millisOf(exam.closesAt) };
    const options: { to: ExamStatus; action: ExamStatusAction; label: string }[] = [
      { to: "published", action: status === "closed" ? "reopened" : "published", label: status === "closed" ? "Reopen" : "Publish" },
      { to: "draft", action: "draft", label: "Back to draft" },
      { to: "closed", action: "closed", label: "Close early" },
    ];
    return options.filter((o) => canTransition(status, o.to, ctx));
  }

  return {
    exam,
    draft,
    setDraft,
    saved,
    loading,
    error,
    busy,
    notice,
    setNotice,
    mode,
    canManage,
    dirty,
    issues,
    issuesByQuestion: grouped.byQuestion,
    generalIssues: grouped.general,
    hasAttempts,
    save,
    blockers,
    checkDay,
    changeStatus,
    availableActions,
    reload: load,
  };
}

const STATUS_DONE: Record<ExamStatusAction, string> = {
  published: "Published. Students of the class can open it when the window opens.",
  draft: "Returned to a draft.",
  closed: "Closed. No new attempts can start.",
  reopened: "Reopened.",
};
