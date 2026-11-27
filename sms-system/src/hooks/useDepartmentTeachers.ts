import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { DATA_MODE } from "@/lib/data";
import { REFERENCE_STALE_MS } from "@/lib/queryPolicies";

export type DepartmentTeacher = { id: string; name: string };

/**
 * A senior teacher's own department's teachers: the only teachers the users rules let them list (firestore.rules,
 * `match /users/{uid}`: the department must be the reader's own departmentId, the id, never the name). One cached read,
 * shared by the slot form's teacher list and the Schedule page's edit check (a senior teacher may edit a slot only
 * when its teacher is in this list), so the rule lives in one place and opening the form costs no extra read.
 *
 * Kept in memory only (names): 'departmentTeachers' is not in lib/queryPersistence.ts's allow-list.
 */
export function useDepartmentTeachers(
  departmentId: string | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
): { teachers: DepartmentTeacher[]; loading: boolean } {
  const { institutionId } = useAuth();
  const result = useQuery({
    queryKey: ["departmentTeachers", institutionId, departmentId ?? ""],
    queryFn: async (): Promise<DepartmentTeacher[]> => {
      const snap = await getDocs(
        query(
          collection(db, "users"),
          where("institutionId", "==", institutionId),
          where("role", "in", ["regular_teacher", "senior_teacher"]),
          where("departmentId", "==", departmentId),
        ),
      );
      return snap.docs.map((d) => ({
        id: d.id,
        name: String(d.data().name ?? ""),
      }));
    },
    enabled:
      enabled &&
      DATA_MODE === "live" &&
      !!institutionId &&
      institutionId !== "*" &&
      !!departmentId,
    staleTime: REFERENCE_STALE_MS,
  });
  return { teachers: result.data ?? [], loading: result.isLoading };
}
