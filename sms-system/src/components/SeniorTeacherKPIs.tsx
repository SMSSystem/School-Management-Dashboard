import { DATA_MODE } from "@/lib/data";

const kpis = [
  { label: "Teachers in Dept", icon: "/teacher.png", mockValue: "8" },
  { label: "Classes in Dept", icon: "/class.png", mockValue: "6" },
  { label: "Students in Dept", icon: "/student.png", mockValue: "142" },
];

const SeniorTeacherKPIs = () => {
  const isMock = DATA_MODE === "mock";

  return (
    <div className="col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
      {kpis.map(({ label, icon, mockValue }) => (
        <div
          key={label}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5 flex items-center gap-4"
        >
          <img
            src={icon}
            alt=""
            width={28}
            height={28}
            className="opacity-50 dark:invert shrink-0"
          />
          <div>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {isMock ? mockValue : "—"}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SeniorTeacherKPIs;
