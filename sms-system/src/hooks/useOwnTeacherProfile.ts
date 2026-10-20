import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";

/**
 * The signed-in person's own department and name, read once from their users document (always readable by its
 * owner). The Result and Feedback Comment forms write them onto the record and its audit entry.
 */
export function useOwnTeacherProfile(): { departmentId: string; teacherName: string } {
  const { user } = useAuth();
  const [departmentId, setDepartmentId] = useState("");
  const [teacherName, setTeacherName] = useState("");

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then(
      (snap) => {
        if (snap.exists()) {
          setDepartmentId(snap.data().departmentId ?? "");
          setTeacherName(snap.data().name ?? "");
        }
      },
      onLoadError("your profile"),
    );
  }, [user?.uid]);

  return { departmentId, teacherName };
}
