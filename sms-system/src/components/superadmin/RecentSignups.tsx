type SignupStatus = "active" | "suspended";

interface RecentInstitution {
  id: number;
  name: string;
  location: string;
  date: string;
  status: SignupStatus;
}

const recentSignups: RecentInstitution[] = [
  { id: 1, name: "Greenfield Academy", location: "Lagos, NG", date: "2026-05-18", status: "active" },
  { id: 2, name: "Sunridge International", location: "Accra, GH", date: "2026-05-17", status: "active" },
  { id: 3, name: "Maputo Primary School", location: "Maputo, MZ", date: "2026-05-15", status: "active" },
  { id: 4, name: "Victoria Heights College", location: "Nairobi, KE", date: "2026-05-14", status: "active" },
  { id: 5, name: "Riverbank Academy", location: "Kampala, UG", date: "2026-05-12", status: "suspended" },
  { id: 6, name: "Harlow Grammar School", location: "Abuja, NG", date: "2026-05-10", status: "active" },
  { id: 7, name: "Lakeside Prep", location: "Dar es Salaam, TZ", date: "2026-05-08", status: "active" },
  { id: 8, name: "St. Francis College", location: "Kigali, RW", date: "2026-05-05", status: "active" },
];

const RecentSignups = () => {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">Recent Sign-ups</h1>
        <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
          Last 10
        </span>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0 pr-1">
        {recentSignups.map((school) => (
          <div
            key={school.id}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-lamaSkyLight dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-sky-600 dark:text-sky-400 shrink-0">
              {school.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
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
              <span className="text-xs text-gray-400 dark:text-gray-500">{school.date}</span>
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
