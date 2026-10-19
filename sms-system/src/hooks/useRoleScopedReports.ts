import { useEffect, useState } from "react";
import { query, where } from "firebase/firestore";
import { subscribeSnapshot } from "@/lib/sharedSnapshot";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";
import { institutionCollection } from "@/lib/paths";

type ReportCollection = "reportCards" | "progressReports";

// The live list behind the Report Cards and Progress Reports pages, scoped to what the signed-in
// role may read (firestore.rules): a student's own documents, a parent's linked children, and the
// whole institution for staff. `loadLabel` names the list in the message shown if the read fails.
export function useRoleScopedReports<T>(
  collectionName: ReportCollection,
  linkedStudentIds: string[],
  loadLabel: string,
  enabled = true,
): { rows: (T & { id: string })[]; loading: boolean } {
  const { user, role, institutionId } = useAuth();
  const [rows, setRows] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled || !institutionId || institutionId === "*") return;

    let q;
    if (role === "student" && user?.uid) {
      q = query(
        institutionCollection(institutionId, collectionName),
        where("studentId", "==", user.uid),
      );
    } else if (role === "parent") {
      if (linkedStudentIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      // Firestore 'in' queries are limited to 10 values. Parents with more than
      // 10 linked children will silently miss records beyond the first 10.
      // Chunked queries (batching in groups of 10) are a future enhancement.
      q = query(
        institutionCollection(institutionId, collectionName),
        where("studentId", "in", linkedStudentIds.slice(0, 10)),
      );
    } else {
      q = query(institutionCollection(institutionId, collectionName));
    }

    return subscribeSnapshot(`${collectionName}:${institutionId}:${role}:${user?.uid ?? ""}`,
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T & { id: string }));
        setLoading(false);
      },
      onLoadError(loadLabel, () => setLoading(false)),
    );
  }, [enabled, collectionName, institutionId, role, user, linkedStudentIds, loadLabel]);

  return { rows, loading };
}
