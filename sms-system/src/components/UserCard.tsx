import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { USE_MOCK } from "@/lib/data";

type UserCardType = "student" | "teacher" | "parent" | "class";

const labels: Record<UserCardType, string> = {
  student: "Students",
  teacher: "Teachers",
  parent: "Parents",
  class: "Classes",
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
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "student"),
      );
    } else if (type === "teacher") {
      q = query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "in", ["regular_teacher", "senior_teacher"]),
      );
    } else if (type === "parent") {
      q = query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "parent"),
      );
    } else {
      q = query(
        collection(db, "classes"),
        where("institutionId", "==", institutionId),
      );
    }

    return onSnapshot(q, (snap) => setCount(snap.size));
  }, [institutionId, type]);

  const isMock = USE_MOCK;
  const displayCount = isMock
    ? mockCounts[type]
    : count === null
      ? "…"
      : count.toLocaleString();

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 flex-1 min-w-32">
      <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">{labels[type]}</h2>
      <h1 className="text-2xl font-semibold my-2 text-gray-800 dark:text-gray-100">{displayCount}</h1>
    </div>
  );
};

export default UserCard;
