import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { actorName, staffFallback } from "@/lib/auditLog";
import { canManageExam, canViewExamContent } from "@/lib/examAccess";
import {
  addExtraTime,
  cleanupAttempts,
  finalizeExam,
  gradeAttempts,
  regradeStudent,
  releaseGrades,
  saveManualGrade,
  syncResults,
  type GradingContext,
} from "@/lib/examGrading";
import { gradeNowState, planGrading, releasePlan, resultsToSync } from "@/lib/examGradingLogic";
import { canAutoGrade } from "@/lib/examKeyValidation";
import { millisOf } from "@/lib/examListLogic";
import { finalizeBlockers } from "@/lib/examRelease";
import {
  applyStudentRecord,
  buildResultRows,
  difficultyRows,
  resultCounts,
  scoreStats,
  writesLeft,
  type ResultRow,
} from "@/lib/examResultsRows";
import { loadAttempts, loadResultsData, loadRoster, loadStudentRecord, type ResultsData } from "@/lib/examResultsData";
import { questionStatsFrom } from "@/lib/examStats";
import { examPhase } from "@/lib/examTiming";
import { LIST_STALE_MS } from "@/lib/queryPolicies";
import { classifyError, describeError, reportError } from "@/lib/reportError";
import type { ExamQuestionStat } from "@/types/exams";

export type ResultsNotice = { kind: "ok" | "error"; text: string };

const friendly = (err: unknown): string =>
  err instanceof Error && (err.name === "FinalizeBlockedError" || /^(The score|Give a reason|Extra time|This (student|exam))/.test(err.message))
    ? err.message
    : describeError(classifyError(err), "the results");

// Everything the staff results screen needs (EXAMS_FEATURE_SPEC.md §4.7, §6, §9): the exam's grades and counts, the class
// roster (cached), the rows and figures built from them, and the actions. Opening the screen after the window has closed
// grades the submitted attempts by itself when Auto-Grade is on and the key is complete, then copies released scores into the
// results; a banner says what it did. An action on the whole class reloads the data afterwards; an action on one
// student (a score, a re-grade, extra time) reads only that student's grade and extra time (two reads), so entering the
// scores of a class one by one does not read the whole screen again each time.
export function useExamResults(examId: string | undefined) {
  const { user, role, institutionId, displayName, departmentId } = useAuth();
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ResultsNotice | null>(null);
  const [autoNote, setAutoNote] = useState<string | null>(null);
  const [liveStats, setLiveStats] = useState<Record<string, ExamQuestionStat> | null>(null);
  const autoRan = useRef(false);

  const person = useMemo(() => ({ uid: user?.uid, role, departmentId }), [user?.uid, role, departmentId]);
  const actor = user ? { uid: user.uid, name: actorName(displayName, user.email, staffFallback(role)) } : null;
  const ctx: GradingContext | null = data && actor && institutionId ? { institutionId, exam: data.exam, actor } : null;
  const canManage = !!data && canManageExam(data.exam, person);

  const fetchData = useCallback(async (): Promise<ResultsData | null> => {
    if (!examId || !institutionId || institutionId === "*") {
      setError("This exam could not be found.");
      return null;
    }
    return loadResultsData(institutionId, examId, (exam) =>
      exam.online !== true
        ? "This exam is not an online exam."
        : !canViewExamContent(exam, person)
          ? "You do not have access to this exam's results."
          : null,
    );
  }, [examId, institutionId, person]);

  const reload = useCallback(async () => {
    try {
      const next = await fetchData();
      if (next) {
        setData(next);
        setError(null);
      }
      return next;
    } catch (err) {
      reportError(err, { what: "the results", quiet: true });
      setError(err instanceof Error && /^(This exam|You do not)/.test(err.message) ? err.message : describeError(classifyError(err), "the results"));
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const roster = useQuery({
    queryKey: ["examRoster", institutionId, data?.exam.classId, data?.exam.subjectId],
    queryFn: () => loadRoster(institutionId!, data!.exam.classId, data!.exam.subjectId),
    enabled: !!data && !!institutionId && institutionId !== "*",
    staleTime: LIST_STALE_MS,
  });

  const exam = data?.exam;
  const nowMs = Date.now();
  const phase = exam ? examPhase({ status: exam.status, opensAtMs: millisOf(exam.opensAt), closesAtMs: millisOf(exam.closesAt) }, nowMs) : "draft";
  const keyRevision = exam?.keyRevision ?? 1;
  const maxScore = exam ? (exam.totalPoints ?? data!.questions.reduce((s, q) => s + q.points, 0)) : 0;

  const rows: ResultRow[] = useMemo(
    () =>
      data
        ? buildResultRows({
            roster: roster.data ?? [],
            grades: data.grades,
            attempts: data.attempts,
            accommodations: data.accommodations,
            maxScore,
            keyRevision,
            nowMs: Date.now(),
            exam: { durationMinutes: data.exam.duration ?? 0, preset: data.exam.integrity },
          })
        : [],
    [data, roster.data, maxScore, keyRevision],
  );
  const counts = useMemo(() => resultCounts(rows, data?.attemptCount ?? 0), [rows, data?.attemptCount]);
  const stats = useMemo(() => scoreStats(rows), [rows]);

  const autoGradeOk = !!exam && !!data && canAutoGrade(exam, data.questions, data.key);
  const gradeState = gradeNowState({
    autoGrade: exam?.autoGrade === true,
    canAutoGrade: autoGradeOk,
    ungraded: counts.ungraded,
    needsRegrade: counts.needsRegrade,
  });
  const releasePending = data ? releasePlan(data.grades).length : 0;
  const toSync = data ? resultsToSync(data.grades, nowMs).length : 0;

  // Opening the screen: grade what has been submitted (once the window has closed), then copy released scores.
  useEffect(() => {
    if (!data || !ctx || !canManage || autoRan.current) return;
    autoRan.current = true;
    void (async () => {
      let current: ResultsData = data;
      const notes: string[] = [];
      try {
        const plan = planGrading({ attempts: data.attempts ?? [], grades: data.grades, keyRevision, nowMs: Date.now() });
        const fresh = plan.grade.length - plan.regrade.length;
        if (phase === "closed" && data.exam.autoGrade === true && autoGradeOk && fresh > 0) {
          const run = await gradeAttempts(ctx, data, { regrade: false, freshGrades: false });
          setLiveStats(run.questionStats);
          notes.push(`Graded ${run.graded} submitted attempt${run.graded === 1 ? "" : "s"} automatically.`);
          current = (await fetchData()) ?? current;
        }
        const pending = resultsToSync(current.grades, Date.now()).length;
        if (pending > 0) {
          await syncResults({ ...ctx, exam: current.exam }, current, { freshGrades: false });
          notes.push(`Copied ${pending} released score${pending === 1 ? "" : "s"} into the results.`);
          current = (await fetchData()) ?? current;
        }
        if (notes.length > 0) {
          setData(current);
          setAutoNote(notes.join(" "));
        }
      } catch (err) {
        reportError(err, { what: "the automatic grading", quiet: true });
        setNotice({ kind: "error", text: `The automatic step did not finish. ${friendly(err)}` });
      }
    })();
    // The effect runs once, when the data first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Runs one action: null when it worked, otherwise the message (a dialog shows it and stays open). `only` is the student
  // an action changed alone: that student's record is read again instead of the whole screen.
  const act = async (work: () => Promise<string>, only?: string): Promise<string | null> => {
    if (!ctx || busy) return "Please wait a moment and try again.";
    setBusy(true);
    setNotice(null);
    try {
      const text = await work();
      if (only && institutionId) {
        try {
          const record = await loadStudentRecord(institutionId, ctx.exam.id, only);
          setData((d) => (d ? applyStudentRecord(d, only, record) : d));
        } catch {
          await reload();
        }
      } else {
        await reload();
      }
      setNotice({ kind: "ok", text });
      return null;
    } catch (err) {
      reportError(err, { what: "the results", quiet: true });
      const text = friendly(err);
      setNotice({ kind: "error", text });
      return text;
    } finally {
      setBusy(false);
    }
  };

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  const blockersForFinalize = (): string[] =>
    data
      ? finalizeBlockers({
          attempts: (data.attempts ?? []).map((a) => ({ studentId: a.studentId, status: a.status, deadlineAtMs: a.deadlineAtMs })),
          grades: data.grades,
          nowMs: Date.now(),
        }).map((b) => b.message)
      : [];

  return {
    data,
    loading,
    error,
    busy,
    notice,
    autoNote,
    canManage,
    phase,
    rows,
    counts,
    stats,
    maxScore,
    gradeState,
    releasePending,
    writesLeft: writesLeft({ toGrade: counts.ungraded + counts.needsRegrade, toRelease: exam?.releaseMode === "manual" ? releasePending : 0, toSync }),
    rosterLoading: roster.isLoading,
    difficulty: exam?.status === "finalized" ? (exam.questionStats ?? null) : liveStats,
    difficultyRows: data ? difficultyRows(data.questions, (exam?.status === "finalized" ? exam.questionStats : liveStats) ?? {}) : [],
    reload: async () => {
      setBusy(true);
      await reload();
      setBusy(false);
    },
    dismissNotice: () => setNotice(null),
    blockersForFinalize,
    gradeNow: () =>
      act(async () => {
        const run = await gradeAttempts(ctx!, data!);
        setLiveStats(run.questionStats);
        return run.graded === 0 ? "Nothing needed grading." : `Graded ${plural(run.graded, "attempt")}${run.regraded ? `, ${run.regraded} re-graded` : ""}.`;
      }),
    release: () => act(async () => `Released ${plural(await releaseGrades(ctx!), "score")}.`),
    saveScore: (p: { studentId: string; studentName: string; score: number; reason?: string; comment?: string }) =>
      act(async () => {
        await saveManualGrade(ctx!, data!, p);
        return `Saved the score of ${p.studentName}.`;
      }, p.studentId),
    regrade: (p: { studentId: string; studentName: string }) =>
      act(async () => {
        await regradeStudent(ctx!, data!, p);
        return `Re-graded ${p.studentName}.`;
      }, p.studentId),
    giveExtraTime: (p: { studentId: string; studentName: string; extraMinutes: number }) =>
      act(async () => {
        await addExtraTime(ctx!, p);
        return `${p.studentName} now has ${plural(p.extraMinutes, "minute")} of extra time.`;
      }, p.studentId),
    finalize: () =>
      act(async () => {
        const out = await finalizeExam(ctx!, data!);
        return out.failed > 0
          ? `Finalized, but ${plural(out.failed, "attempt")} could not be removed yet. Use Finish clean-up.`
          : `Finalized. ${plural(out.removed, "attempt")} removed; the scores and results are kept.`;
      }),
    cleanup: () =>
      act(async () => {
        const out = await cleanupAttempts(ctx!);
        return out.failed > 0 ? `${plural(out.failed, "attempt")} still could not be removed.` : `Removed ${plural(out.removed, "attempt")}.`;
      }),
    loadDifficulty: () =>
      act(async () => {
        const attempts = data!.attempts ?? (await loadAttempts(ctx!.institutionId, ctx!.exam.id));
        setLiveStats(questionStatsFrom(attempts.filter((a) => a.status === "submitted"), data!.questions, data!.key));
        return "Question difficulty loaded.";
      }),
  };
}
