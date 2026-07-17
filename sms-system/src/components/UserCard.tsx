import { useEffect, useState } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { memberCollection, classCollection } from "@/lib/firestorePaths";
import { useAuth } from "@/lib/AuthContext";
import { USE_MOCK } from "@/lib/data";
import { activeDocs } from "@/lib/utils";

type UserCardType = "student" | "teacher" | "parent" | "class";

const tourIds: Record<UserCardType, string> = {
  student: 'tour-home-user-card-students',
  teacher: 'tour-home-user-card-teachers',
  parent:  'tour-home-user-card-parents',
  class:   'tour-home-user-card-classes',
};

const labels: Record<UserCardType, string> = {
  student: "Students (total)",
  teacher: "Teachers (total)",
  parent: "Parents (total)",
  class: "Classes (total)",
};

const mockCounts: Record<UserCardType, string> = {
  student: "1,234",
  teacher: "48",
  parent: "892",
  class: "24",
};

const UserCard = ({ type }: { type: UserCardType }) => {
  const { institutionId } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (USE_MOCK || !institutionId) return;

    let q;
    if (type === "student") {
      q = query(
        memberCollection(db, institutionId!),
        where("role", "==", "student"),
      );
    } else if (type === "teacher") {
      q = query(
        memberCollection(db, institutionId!),
        where("role", "in", ["regular_teacher", "senior_teacher"]),
      );
    } else if (type === "parent") {
      q = query(
        memberCollection(db, institutionId!),
        where("role", "==", "parent"),
      );
    } else {
      q = query(
        classCollection(db, institutionId!),
      );
    }

    return onSnapshot(q, (snap) => setCount(activeDocs(snap.docs).length));
  }, [institutionId, type]);

  const isMock = USE_MOCK;
  const displayCount = isMock
    ? mockCounts[type]
    : count === null
      ? "…"
      : count.toLocaleString();

  return (
    <div id={tourIds[type]} className="rounded-2xl bg-white dark:bg-gray-800 p-4 flex-1 min-w-32">
      <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">{labels[type]}</h2>
      <h1 className="text-2xl font-semibold my-2 text-gray-800 dark:text-gray-100">{displayCount}</h1>
    </div>
  );
};

export default UserCard;
