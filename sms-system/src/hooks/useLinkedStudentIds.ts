import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";

// The ids of the signed-in parent's linked children, for pages that filter a collection to them.
// Empty for every other role (no read). `enabled` lets a page switch it off, as mock mode does.
export function useLinkedStudentIds(enabled: boolean): string[] {
  const { user, role } = useAuth();
  const [linkedStudentIds, setLinkedStudentIds] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled || role !== "parent" || !user) return;
    getDocs(
      query(
        collection(db, "student_parents"),
        where("parentId", "==", user.uid),
      ),
    ).then((snap) =>
      setLinkedStudentIds(
        snap.docs.map((d) => d.id.replace(`${user.uid}_`, "")),
      ),
      onLoadError("your children"),
    );
  }, [enabled, role, user]);

  return linkedStudentIds;
}
