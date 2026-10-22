import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { loadMyDeadline, saveCheckpoint, submitAttempt } from "@/lib/examAttemptSession";
import { classifyAttemptWrite, submitSummary, trackAway } from "@/lib/examAttemptLogic";
import { clearExamDraft, writeExamDraft } from "@/lib/examAnswerDraft";
import { localDraftBaseMs } from "@/lib/examClock";
import { checkpointDue, deadlineRecheckDue, remainingMs } from "@/lib/examTiming";
import { toggleAnswer, toggleFlag } from "@/lib/examTakeLogic";
import type { StudentExam } from "@/lib/examAttemptSession";
import type { ExamQuestion } from "@/types/exams";
import type { FinishedKind } from "@/components/exam/take/ExamFinishedScreen";

export type RunningSession = {
  exam: StudentExam;
  /** In this student's own order. */
  questions: ExamQuestion[];
  deadlineMs: number;
  /** The extra minutes this student was given. */
  extraMinutes: number;
  /** serverNow − deviceNow, or null when it could not be read (the device clock is then used). */
  offsetMs: number | null;
  initial: { answers: Record<string, string[]>; flags: string[]; tabSwitches: number };
};

const TICK_MS = 1000;
const CHECKPOINT_TICK_MS = 20_000;
const RETRY_SUBMIT_MS = 5000;

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

// A student's attempt while it runs (EXAMS_FEATURE_SPEC.md §4.5): the answers, flags and tab-switch count; the
// countdown from the deadline the server accepted; a checkpoint every few minutes when something changed; the local
// backup on every change; one tab-switch count per leave; and the submit, by the student or at time-up. useExamAttempt
// decides when an attempt is running; this runs it.
export function useRunningAttempt(session: RunningSession, onFinish: (kind: FinishedKind) => void) {
  const { user, institutionId } = useAuth();
  const { exam, questions, offsetMs } = session;
  const uid = user?.uid ?? "";
  const examId = exam.id;
  const offset = offsetMs ?? 0;

  // The deadline can move later while the student is sitting: a teacher can give them extra time, which is found by one
  // read when about a minute is left and by another at time-up, before the automatic submit (refreshDeadline).
  const [deadlineMs, setDeadlineMs] = useState(session.deadlineMs);
  const [answers, setAnswers] = useState(session.initial.answers);
  const [flags, setFlags] = useState(session.initial.flags);
  const [tabSwitches, setTabSwitches] = useState(session.initial.tabSwitches);
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState(() => remainingMs(Date.now(), deadlineMs, offset));
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState("Not saved to the server yet");

  // The values the timers read, kept current after every render.
  const latest = useRef({ answers, flags, tabSwitches });
  useEffect(() => {
    latest.current = { answers, flags, tabSwitches };
  });
  const changes = useRef(0); // how many edits have been made
  const savedChanges = useRef(0); // how many of them a checkpoint has carried
  const lastSavedAt = useRef(Date.now());
  const saving = useRef(false);
  const ending = useRef(false);
  const away = useRef(false);
  const lastAutoTry = useRef(0);
  const baseMs = useRef(localDraftBaseMs(Date.now(), offsetMs));
  const deadlineRef = useRef(session.deadlineMs);
  const nearEndChecked = useRef(false);
  const refreshing = useRef<Promise<boolean> | null>(null);

  const touch = useCallback(() => {
    changes.current += 1;
  }, []);

  // The backup in the browser, on every change.
  useEffect(() => {
    if (institutionId && uid) {
      writeExamDraft(uid, institutionId, examId, { answers, flags, tabSwitches, baseLastSavedMs: baseMs.current });
    }
  }, [answers, flags, tabSwitches, institutionId, uid, examId]);

  const state = () => ({ institutionId: institutionId ?? "", examId, uid, questions, ...latest.current });

  const checkpoint = useCallback(async () => {
    if (saving.current || ending.current || !institutionId || !uid) return;
    saving.current = true;
    const carried = changes.current;
    setSaveStatus("Saving…");
    try {
      await saveCheckpoint({ institutionId, examId, uid, questions, ...latest.current });
      savedChanges.current = carried;
      lastSavedAt.current = Date.now();
      baseMs.current = localDraftBaseMs(Date.now(), offsetMs);
      setSaveStatus(`Saved at ${timeFormat.format(new Date())}`);
    } catch (err) {
      setSaveStatus(classifyAttemptWrite(err) === "offline" ? "Not saved: no connection. Trying again." : "Not saved to the server yet");
    } finally {
      saving.current = false;
    }
  }, [institutionId, examId, uid, questions, offsetMs]);

  // One read of the deadline stored on the student's own attempt: staff may have lengthened it (extra time). True when
  // it moved later, and the countdown follows it. A failed read (no connection) changes nothing. Calls made while a
  // read is in flight share it.
  const refreshDeadline = useCallback((): Promise<boolean> => {
    if (!institutionId || !uid) return Promise.resolve(false);
    if (!refreshing.current) {
      refreshing.current = (async () => {
        try {
          const moved = await loadMyDeadline(institutionId, examId, uid);
          if (moved !== null && moved > deadlineRef.current) {
            deadlineRef.current = moved;
            nearEndChecked.current = false;
            setDeadlineMs(moved);
            setSaveStatus("Your teacher has given you extra time.");
            return true;
          }
        } catch {
          // no connection: carry on with the deadline known
        }
        return false;
      })().finally(() => {
        refreshing.current = null;
      });
    }
    return refreshing.current;
  }, [institutionId, examId, uid]);

  const submit = useCallback(
    async (reason: "student" | "timeout") => {
      if (ending.current || !institutionId || !uid) return;
      ending.current = true;
      setSubmitting(true);
      setError(null);
      try {
        await submitAttempt({ ...state(), reason });
        clearExamDraft(uid, institutionId, examId);
        onFinish(reason === "student" ? "submitted" : "timeout");
      } catch (err) {
        ending.current = false;
        setSubmitting(false);
        const kind = classifyAttemptWrite(err);
        if (kind === "too_late") {
          clearExamDraft(uid, institutionId, examId);
          onFinish("late");
          return;
        }
        setError(
          kind === "offline"
            ? "Could not reach the server. Check your connection; your answers are still here."
            : "Your answers could not be submitted. Try again.",
        );
      }
    },
    // state() reads refs and props that are stable for a session
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [institutionId, uid, examId, questions, onFinish],
  );

  // The countdown; one read of the deadline when about a minute is left; at time-up the deadline is read once more and
  // the attempt is submitted only if it did not move (retried every few seconds if the connection is down). A hidden tab
  // may run its timers only once a minute, so coming back to the tab or window ticks at once.
  const tick = useCallback(() => {
    const left = remainingMs(Date.now(), deadlineMs, offset);
    setRemaining(left);
    if (deadlineRecheckDue(left, nearEndChecked.current)) {
      nearEndChecked.current = true;
      void refreshDeadline();
    }
    if (left <= 0 && !ending.current && Date.now() - lastAutoTry.current >= RETRY_SUBMIT_MS) {
      lastAutoTry.current = Date.now();
      setConfirming(false);
      void refreshDeadline().then((moved) => {
        if (!moved) void submit("timeout");
      });
    }
  }, [deadlineMs, offset, submit, refreshDeadline]);

  useEffect(() => {
    const id = setInterval(tick, TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
    };
  }, [tick]);

  // A checkpoint when something changed and the exam's interval has passed.
  useEffect(() => {
    const id = setInterval(() => {
      const dirty = changes.current !== savedChanges.current;
      if (checkpointDue({ dirty, lastSavedMs: lastSavedAt.current, nowMs: Date.now(), intervalMinutes: exam.checkpointMinutes ?? 10 })) {
        void checkpoint();
      }
    }, CHECKPOINT_TICK_MS);
    return () => clearInterval(id);
  }, [checkpoint, exam.checkpointMinutes]);

  // Leaving the tab or the window is counted once per leave, and saved with the next checkpoint.
  useEffect(() => {
    const check = () => {
      const step = trackAway(away.current, { visible: document.visibilityState === "visible", focused: document.hasFocus() });
      away.current = step.away;
      if (step.counted) {
        touch();
        setTabSwitches((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("blur", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("blur", check);
      window.removeEventListener("focus", check);
    };
  }, [touch]);

  // Closing or reloading the page asks first while the attempt is running.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const summary = submitSummary(questions, answers, flags);

  return {
    answers,
    flags,
    current,
    remaining,
    confirming,
    submitting,
    error,
    saveStatus,
    summary,
    select: setCurrent,
    toggleOption: (questionId: string, optionId: string) => {
      const question = questions.find((q) => q.id === questionId);
      if (!question) return;
      touch();
      setAnswers((a) => ({ ...a, [questionId]: toggleAnswer(question, a[questionId], optionId) }));
    },
    toggleFlag: (questionId: string) => {
      touch();
      setFlags((f) => toggleFlag(f, questionId));
    },
    askToSubmit: () => {
      setError(null);
      setConfirming(true);
    },
    cancelSubmit: () => setConfirming(false),
    confirmSubmit: () => void submit("student"),
  };
}
