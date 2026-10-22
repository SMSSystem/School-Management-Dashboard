import { useEffect, useMemo, useState } from "react";
import { getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { institutionDoc } from "@/lib/paths";
import { classifyError, describeError, reportError } from "@/lib/reportError";
import { canManageExam, canViewExamContent } from "@/lib/examAccess";
import { loadExamQuestions } from "@/lib/examContent";
import { previewQuestions } from "@/lib/examTakeLogic";
import type { ExamDocument, ExamQuestion } from "@/types/exams";

export type PreviewExam = ExamDocument & { id: string };

// What the staff preview page needs (EXAMS_FEATURE_SPEC.md §4.7): the exam and its saved questions, read once, put
// in the order a student would see (shuffled when the exam shuffles). It reads the questions only, never the key,
// and writes nothing.
export function useExamPreview(examId: string | undefined) {
  const { user, role, institutionId, departmentId } = useAuth();
  const [exam, setExam] = useState<PreviewExam | null>(null);
  const [items, setItems] = useState<ExamQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const person = useMemo(() => ({ uid: user?.uid, role, departmentId }), [user?.uid, role, departmentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!examId || !institutionId || institutionId === "*") {
        setError("This exam could not be found.");
        return;
      }
      try {
        const snap = await getDoc(institutionDoc(institutionId, "exams", examId));
        if (cancelled) return;
        if (!snap.exists()) {
          setError("This exam could not be found.");
          return;
        }
        const loaded = { id: snap.id, ...snap.data() } as PreviewExam;
        setExam(loaded);
        if (loaded.online !== true) {
          setError("This exam is not an online exam, so there is nothing to preview.");
          return;
        }
        if (!canViewExamContent(loaded, person)) {
          setError("You do not have access to this exam's questions.");
          return;
        }
        const content = await loadExamQuestions(institutionId, examId);
        if (cancelled) return;
        setItems(content?.items ?? []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        reportError(err, { what: "the exam" });
        setError(describeError(classifyError(err), "the exam"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, institutionId, person]);

  // The order is made once per load, and again when "Shuffle again" is pressed.
  const shown = useMemo(
    () => previewQuestions(items, exam?.shuffle !== false).questions,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, exam?.shuffle, round],
  );

  return {
    exam,
    questions: shown,
    loading,
    error,
    canManage: !!exam && canManageExam(exam, person),
    reshuffle: () => setRound((n) => n + 1),
  };
}
