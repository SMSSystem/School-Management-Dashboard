import { useQuery } from "@tanstack/react-query";
import { getDocs, query, where } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { USE_MOCK } from "@/lib/data";
import { classIdGroups, examListClassIds } from "@/lib/examListQuery";
import type { ExamListDoc } from "@/lib/examStudentRows";
import { institutionCollection } from "@/lib/paths";
import { LIST_STALE_MS } from "@/lib/queryPolicies";
import { useLinkedChildren } from "./useLinkedChildren";

const NONE: ExamListDoc[] = [];

/** The query root, so a change that makes the cached exams wrong can invalidate them. */
const STUDENT_EXAMS_QUERY_KEY = "studentExams";

// The exams a student or a parent may be shown (EXAMS_FEATURE_SPEC.md §4.5, §9): those of the classes involved, read
// once per five minutes. The staff list listens to the whole collection; for a school of students and parents that
// would be every exam of the institution on every page visit, so this asks for the classes only. No listener, no
// index (one equality filter on the class). For any other role it does nothing.
export function useStudentExams(): { exams: ExamListDoc[]; loading: boolean } {
  const { role, institutionId, classId, classIds } = useAuth();
  const { children, loading: childrenLoading } = useLinkedChildren();
  const side = role === "student" ? "student" : role === "parent" ? "parent" : null;
  const ids =
    side === "student"
      ? examListClassIds({ role: "student", membership: { classId, classIds } })
      : side === "parent"
        ? examListClassIds({ role: "parent", children })
        : [];
  const enabled = !USE_MOCK && !!side && !!institutionId && institutionId !== "*" && ids.length > 0;

  const result = useQuery({
    queryKey: [STUDENT_EXAMS_QUERY_KEY, institutionId, ids.join(",")],
    queryFn: async (): Promise<ExamListDoc[]> => {
      const snaps = await Promise.all(
        classIdGroups(ids).map((group) => getDocs(query(institutionCollection(institutionId!, "exams"), where("classId", "in", group)))),
      );
      return snaps.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExamListDoc));
    },
    enabled,
    staleTime: LIST_STALE_MS,
  });

  return { exams: result.data ?? NONE, loading: (side === "parent" && childrenLoading) || (enabled && result.isLoading) };
}
