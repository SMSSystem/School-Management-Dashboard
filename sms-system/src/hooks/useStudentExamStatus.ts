import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { loadGrade, loadMyAttempt } from "@/lib/examAttemptSession";
import { statusKey, type GradeSummary, type StatusMaps } from "@/lib/examStudentRows";
import type { AttemptSummary } from "@/lib/examStudentLogic";
import { LIST_STALE_MS } from "@/lib/queryPolicies";

export type StatusTarget = { examId: string; studentUid: string; attempt: boolean; grade: boolean };

/** The query root; a finished attempt invalidates it so the list shows the new status at once. */
export const EXAM_STATUS_QUERY_KEY = "examStatus";

type Entry = { key: string; attempt?: AttemptSummary | null; grade?: GradeSummary | null };

// The student's own attempt and the released score of each exam worth reading them for (see statusTargets), for the
// Exams list of a student or a parent (EXAMS_FEATURE_SPEC.md §4.5). One read each, by id, cached for five minutes;
// nothing is listened to. A parent only ever asks for scores.
export function useStudentExamStatus(targets: readonly StatusTarget[]): { maps: StatusMaps; loading: boolean } {
  const { user, institutionId } = useAuth();
  const uid = user?.uid ?? "";
  const targetsKey = targets.map((t) => `${t.examId}:${t.studentUid}:${+t.attempt}${+t.grade}`).join("|");

  const query = useQuery({
    queryKey: [EXAM_STATUS_QUERY_KEY, uid, institutionId, targetsKey],
    queryFn: async (): Promise<Entry[]> =>
      Promise.all(
        targets.map(async (t): Promise<Entry> => {
          const key = statusKey(t.examId, t.studentUid);
          const [attempt, grade] = await Promise.all([
            t.attempt ? loadMyAttempt(institutionId!, t.examId, uid) : Promise.resolve(undefined),
            t.grade ? loadGrade(institutionId!, t.examId, t.studentUid) : Promise.resolve(undefined),
          ]);
          return {
            key,
            ...(attempt !== undefined && {
              attempt: attempt ? { status: attempt.status, deadlineAtMs: attempt.deadlineAt?.toMillis() } : null,
            }),
            ...(grade !== undefined && { grade: grade ? { score: grade.score, maxScore: grade.maxScore, comment: grade.comment } : null }),
          };
        }),
      ),
    enabled: !!institutionId && institutionId !== "*" && !!uid && targets.length > 0,
    staleTime: LIST_STALE_MS,
  });

  const maps = useMemo<StatusMaps>(() => {
    const attempts = new Map<string, AttemptSummary | null>();
    const grades = new Map<string, GradeSummary | null>();
    for (const e of query.data ?? []) {
      if ("attempt" in e) attempts.set(e.key, e.attempt ?? null);
      if ("grade" in e) grades.set(e.key, e.grade ?? null);
    }
    return { attempts, grades };
  }, [query.data]);

  return { maps, loading: query.isLoading && targets.length > 0 };
}
