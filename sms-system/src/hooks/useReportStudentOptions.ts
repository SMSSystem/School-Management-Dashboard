import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";

// The institution's students for the admin's generate panel (Report Cards, Progress Reports), by
// name. `enabled` is true for the roles that can generate, so nobody else pays for the read.
export function useReportStudentOptions(enabled: boolean): { id: string; name: string }[] {
  const { institutionId } = useAuth();
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!enabled || !institutionId || institutionId === "*") return;
    getDocs(
      query(
        collection(db, "users"),
        where("role", "==", "student"),
        where("institutionId", "==", institutionId),
      ),
    ).then((snap) =>
      setStudents(
        snap.docs
          .map((d) => ({ id: d.id, name: d.data().name as string }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
      onLoadError("the students to choose from"),
    );
  }, [enabled, institutionId]);

  return students;
}
