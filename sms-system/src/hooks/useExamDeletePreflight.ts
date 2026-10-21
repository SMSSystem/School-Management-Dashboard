import { useEffect, useState } from "react";
import { loadExamDeletePreflight } from "@/lib/examDelete";
import type { ExamDeleteCounts } from "@/lib/examDeleteLogic";

export type ExamDeletePreflight =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; counts: ExamDeleteCounts; sitting: number };

// What the exam delete dialog tells the administrator before they confirm: what goes with an online exam and whether
// students are still sitting it (EXAMS_FEATURE_SPEC.md §6.9). Read when the dialog opens, never cached: a stale count
// of people sitting would be worse than none. A failed read leaves the button usable; deleteExamCascade checks again.
export function useExamDeletePreflight(institutionId: string | null, examId: string | undefined, enabled: boolean): ExamDeletePreflight {
  const [result, setResult] = useState<ExamDeletePreflight>({ state: "idle" });
  useEffect(() => {
    if (!enabled || !institutionId || !examId) return;
    let cancelled = false;
    setResult({ state: "loading" });
    loadExamDeletePreflight(institutionId, examId).then(
      (r) => {
        if (!cancelled) setResult({ state: "ready", ...r });
      },
      () => {
        if (!cancelled) setResult({ state: "failed" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, institutionId, examId]);
  return result;
}
