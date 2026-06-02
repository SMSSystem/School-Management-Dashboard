import { DATA_MODE } from "@/lib/data";

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
  const isMock = DATA_MODE === "mock";
  const count = isMock ? mockCounts[type] : "—";

  return (
    <div className="rounded-2xl odd:bg-lamaPurple even:bg-lamaYellow p-4 flex-1 min-w-32">
      <div className="flex justify-between items-center">
        {isMock ? (
          <span className="text-xs bg-white px-2 py-1 rounded-full text-green-600">
            2024/25
          </span>
        ) : (
          <span />
        )}
        <img src="/more.png" alt="" width={20} height={20} />
      </div>
      <h1 className="text-2xl font-semibold my-4">{count}</h1>
      <h2 className="text-sm font-medium text-gray-500 dark:text-gray-300">{labels[type]}</h2>
    </div>
  );
};

export default UserCard;
