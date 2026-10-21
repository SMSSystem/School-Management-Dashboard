import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { queryClient } from "@/lib/queryClient";
import { EXAM_STATUS_QUERY_KEY } from "./useStudentExamStatus";
import {
  NoTimeToStartError,
  fetchServerOffset,
  loadAttemptQuestions,
  loadGrade,
  loadMyAccommodation,
  loadMyAttempt,
  loadStudentExam,
  startAttempt,
  type StudentExam,
} from "@/lib/examAttemptSession";
import { classifyAttemptWrite, lateStartNote, mergeLocalDraft } from "@/lib/examAttemptLogic";
import { readExamDraft } from "@/lib/examAnswerDraft";
import { orderQuestions } from "@/lib/examShuffle";
import { serverOffsetMs, examPhase, isPastDeadline } from "@/lib/examTiming";
import { millisOf } from "@/lib/examListLogic";
import { examsForStudent, scoreView } from "@/lib/examStudentLogic";
import { reportError } from "@/lib/reportError";
import type { ExamAttemptDocument, ExamQuestionsDocument } from "@/types/exams";
import type { FinishedKind } from "@/components/exam/take/ExamFinishedScreen";
import type { RunningSession } from "./useRunningAttempt";

export type StartInfo = {
  exam: StudentExam;
  extraMinutes: number;
  offsetMs: number | null;
  /** The server's time when the screen opened (the device clock plus the offset). */
  serverNowMs: number;
  lateNote: string | null;
};

export type AttemptView =
  | { phase: "loading" }
  | { phase: "blocked"; message: string }
  | { phase: "start"; info: StartInfo }
  | { phase: "running"; session: RunningSession }
  | { phase: "finished"; kind: FinishedKind; exam: StudentExam; score: ReturnType<typeof scoreView> };

// Which screen a student sees for an exam (EXAMS_FEATURE_SPEC.md §4.5): the start screen, the running attempt (new or
// resumed), or the finished screen. It reads the exam, the student's extra time and their attempt once, with the
// server's clock offset, and the questions only when the attempt begins or resumes. useRunningAttempt takes over once
// an attempt is running.
export function useExamAttempt(examId: string | undefined) {
  const { user, role, institutionId, displayName, classId, classIds, classSubjects } = useAuth();
  const uid = user?.uid ?? "";
  const [view, setView] = useState<AttemptView>({ phase: "loading" });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // An attempt that exists: carry on with it (a resume, or the end of a start whose read-back failed).
  const enterAttempt = useCallback(
    async (exam: StudentExam, attempt: ExamAttemptDocument, offsetMs: number | null, questionsDoc?: ExamQuestionsDocument | null) => {
      if (!institutionId) return;
      const nowMs = Date.now() + (offsetMs ?? 0);
      const score = () => scoreView(null);
      if (attempt.status === "submitted") {
        const grade = await loadGrade(institutionId, exam.id, uid).catch(() => null);
        setView({ phase: "finished", kind: "submitted", exam, score: grade ? scoreView(grade) : score() });
        return;
      }
      const deadlineMs = attempt.deadlineAt.toMillis();
      if (isPastDeadline(nowMs, deadlineMs)) {
        setView({ phase: "finished", kind: "missed", exam, score: score() });
        return;
      }
      const doc = questionsDoc ?? (await loadAttemptQuestions(institutionId, exam.id));
      if (!doc || doc.items.length === 0) {
        setView({ phase: "blocked", message: "The questions of this exam are not available. Your saved answers are kept; tell your teacher." });
        return;
      }
      const merged = mergeLocalDraft(
        { answers: attempt.answers ?? {}, flags: attempt.flags ?? [], tabSwitches: attempt.tabSwitches ?? 0, lastSavedMs: attempt.lastSavedAt?.toMillis() ?? 0 },
        readExamDraft(uid, institutionId, exam.id),
      );
      setView({
        phase: "running",
        session: {
          exam,
          questions: orderQuestions(doc.items, attempt.order),
          deadlineMs,
          extraMinutes: attempt.extraMinutes ?? 0,
          offsetMs,
          initial: { answers: merged.answers, flags: merged.flags, tabSwitches: merged.tabSwitches },
        },
      });
    },
    [institutionId, uid],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!examId || !institutionId || institutionId === "*" || !uid) return;
      try {
        const [exam, extraMinutes, attempt, offsetMs] = await Promise.all([
          loadStudentExam(institutionId, examId),
          loadMyAccommodation(institutionId, examId, uid),
          loadMyAttempt(institutionId, examId, uid),
          fetchServerOffset(),
        ]);
        if (cancelled) return;
        if (!exam || exam.online !== true) {
          setView({ phase: "blocked", message: "This exam could not be found." });
          return;
        }
        if (examsForStudent([exam], { classId, classIds, classSubjects }).length === 0) {
          setView({ phase: "blocked", message: "This exam is not for your class." });
          return;
        }
        if (attempt) {
          await enterAttempt(exam, attempt, offsetMs);
          return;
        }
        const nowMs = Date.now() + (offsetMs ?? 0);
        const opensAtMs = millisOf(exam.opensAt) ?? 0;
        const closesAtMs = millisOf(exam.closesAt) ?? 0;
        const phase = examPhase({ status: exam.status, opensAtMs, closesAtMs }, nowMs);
        if (phase === "closed" || phase === "finalized") {
          setView({ phase: "finished", kind: "closed", exam, score: null });
          return;
        }
        if (phase === "draft") {
          setView({ phase: "blocked", message: "This exam is not open yet." });
          return;
        }
        setView({
          phase: "start",
          info: {
            exam,
            extraMinutes,
            offsetMs,
            serverNowMs: nowMs,
            lateNote: lateStartNote({ serverNowMs: nowMs, durationMinutes: exam.duration ?? 0, extraMinutes, closesAtMs }),
          },
        });
      } catch (err) {
        if (cancelled) return;
        reportError(err, { what: "the exam" });
        setView({ phase: "blocked", message: "The exam could not be loaded. Check your connection and try again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, institutionId, uid, classId, classIds, classSubjects, enterAttempt]);

  /** Starts the attempt: reads the questions, creates the attempt, and goes to the first question. */
  const begin = useCallback(async () => {
    if (view.phase !== "start" || !institutionId || !uid || starting) return;
    const { exam, extraMinutes, offsetMs } = view.info;
    setStarting(true);
    setStartError(null);
    try {
      const questionsDoc = await loadAttemptQuestions(institutionId, exam.id);
      if (!questionsDoc || questionsDoc.items.length === 0) {
        setStartError("The questions are not available yet. Try again in a moment.");
        return;
      }
      const before = Date.now();
      const attempt = await startAttempt({
        institutionId,
        exam,
        uid,
        studentName: displayName ?? "",
        questions: questionsDoc.items,
        extraMinutes,
        offsetMs,
      });
      const after = Date.now();
      // Without the database offset, the real start time tells how far the device clock is out.
      const offset = offsetMs ?? serverOffsetMs(attempt.startedAt.toMillis(), (before + after) / 2);
      void queryClient.invalidateQueries({ queryKey: [EXAM_STATUS_QUERY_KEY] });
      await enterAttempt(exam, attempt, offset, questionsDoc);
    } catch (err) {
      if (err instanceof NoTimeToStartError) {
        setStartError(err.message);
      } else {
        // The attempt may have been created and only the read-back failed: if it exists, carry on with it.
        const existing = await loadMyAttempt(institutionId, exam.id, uid).catch(() => null);
        if (existing) {
          await enterAttempt(exam, existing, offsetMs);
        } else {
          const kind = classifyAttemptWrite(err);
          setStartError(
            kind === "too_late"
              ? "This exam is no longer open for new attempts."
              : kind === "offline"
                ? "Could not reach the server. Check your connection and try again."
                : "The exam could not be started. Try again.",
          );
        }
      }
    } finally {
      setStarting(false);
    }
  }, [view, institutionId, uid, starting, displayName, enterAttempt]);

  /** The running attempt ended (submitted, timed out, or too late to send). */
  const finish = useCallback(
    (kind: FinishedKind) => {
      void queryClient.invalidateQueries({ queryKey: [EXAM_STATUS_QUERY_KEY] });
      setView((v) => (v.phase === "running" ? { phase: "finished", kind, exam: v.session.exam, score: null } : v));
    },
    [],
  );

  return { view, role, begin, starting, startError, finish };
}
