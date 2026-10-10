import { useRoleCount } from "@/hooks/useDashboardCounts";
import { DATA_MODE, USE_MOCK } from "@/lib/data";

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

// A head-count, read with a Firestore count() aggregation (a handful of reads)
// instead of a live listener on every student/teacher/parent document — see
// lib/dashboardCounts.ts. Not live: refreshed on load, after a user is saved or
// deleted, and every five minutes.
const UserCard = ({ type }: { type: UserCardType }) => {
  const { data: count, isError } = useRoleCount(type);

  const displayCount = USE_MOCK
    ? mockCounts[type]
    : DATA_MODE !== "live"
      ? "0"
      : isError
        ? "—"
        : count === undefined
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
