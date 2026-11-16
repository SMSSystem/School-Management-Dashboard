import { useEffect, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";
import { onLoadError } from "@/lib/reportError";

/**
 * The teacher a teacher's own Assignment or Exam form shows in its locked Teacher field: the signed-in teacher on
 * create, whoever is already on the record (not necessarily them) on update, so a record is never silently reassigned.
 * For a teacher, the id is also put into the form's teacherId field through `setTeacherId`. The teacher's own name is
 * read once from their users document (always readable by its owner), and only when a teacher creates a record.
 */
export function useLockedTeacher({
  user,
  isTeacherRole,
  type,
  data,
  setTeacherId,
}: {
  user: User | null;
  isTeacherRole: boolean;
  type: "create" | "update";
  data?: { teacherId?: unknown; teacherName?: unknown };
  setTeacherId: (teacherId: string) => void;
}): { lockedTeacherId: string; lockedTeacherName: string } {
  const [ownName, setOwnName] = useState("");

  useEffect(() => {
    if (!isTeacherRole || !user || type === "update") return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setOwnName((snap.data().name as string) ?? "");
    }, onLoadError("your name"));
  }, [isTeacherRole, user, type]);

  const lockedTeacherId =
    type === "update" && data?.teacherId
      ? String(data.teacherId)
      : (user?.uid ?? "");
  const lockedTeacherName =
    type === "update" && data?.teacherName ? String(data.teacherName) : ownName;

  // Held in a ref so a new callback each render doesn't set the field again.
  const setRef = useRef(setTeacherId);
  setRef.current = setTeacherId;
  useEffect(() => {
    if (isTeacherRole && lockedTeacherId) setRef.current(lockedTeacherId);
  }, [isTeacherRole, lockedTeacherId]);

  return { lockedTeacherId, lockedTeacherName };
}
