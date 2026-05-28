import { DATA_MODE } from "@/lib/data";
import { institutions } from "./mockData";

const RecentSignups = () => {
  // live branch populated in Phase 5 — falls through to [] until then
  const recentSignups =
    DATA_MODE === 'mock'
      ? [...institutions].sort((a, b) => b.onboardedDate.localeCompare(a.onboardedDate)).slice(0, 10)
      : [];

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Recent Sign-ups</h2>
        <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
          Last {recentSignups.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0 pr-1">
        {recentSignups.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
            {DATA_MODE === 'blank'
              ? "No data — switch to Mock Data or Live Data mode to preview."
              : "No recent sign-ups found."}
          </p>
        )}
        {recentSignups.map((school) => (
          <div
            key={school.id}
            className="flex items-center gap-3 p-2 rounded-lg"
          >
            <div className="w-8 h-8 rounded-full bg-lamaSkyLight dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-sky-600 dark:text-sky-400 shrink-0">
              {school.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                {school.name}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{school.location}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  school.status === "active"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}
              >
                {school.status}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">{school.onboardedDate}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-gray-100 dark:border-gray-700 mt-2">
        <button className="w-full text-xs text-sky-600 dark:text-sky-400 hover:underline font-medium text-center">
          View all institutions →
        </button>
      </div>
    </div>
  );
};

export default RecentSignups;
