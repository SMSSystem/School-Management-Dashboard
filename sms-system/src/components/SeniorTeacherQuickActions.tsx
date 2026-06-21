import { Link } from "react-router-dom";

const quickActions = [
  {
    label: "View My Lessons",
    description: "Browse and manage your lessons",
    icon: "/lesson.png",
    href: "/dashboard/list/lessons",
    colorClasses:
      "text-sky-700 bg-lamaSkyLight dark:bg-sky-900/20 dark:text-sky-300 border border-lamaSky dark:border-sky-800",
  },
  {
    label: "Manage Exams",
    description: "Create and edit department exams",
    icon: "/exam.png",
    href: "/dashboard/list/exams",
    colorClasses:
      "text-yellow-700 bg-lamaYellowLight dark:bg-yellow-900/20 dark:text-yellow-300 border border-lamaYellow dark:border-yellow-800",
  },
  {
    label: "Grade Results",
    description: "Enter and review student results",
    icon: "/result.png",
    href: "/dashboard/list/results",
    colorClasses:
      "text-purple-700 bg-lamaPurpleLight dark:bg-purple-900/20 dark:text-purple-300 border border-lamaPurple dark:border-purple-800",
  },
  {
    label: "Department Classes",
    description: "View all classes in your department",
    icon: "/class.png",
    href: "/dashboard/list/classes",
    colorClasses:
      "text-sky-700 bg-lamaSkyLight dark:bg-sky-900/20 dark:text-sky-300 border border-lamaSky dark:border-sky-800",
  },
];

const SeniorTeacherQuickActions = () => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-3">
        {quickActions.map((action) => (
          <Link
            key={action.label}
            to={action.href}
            className={`flex flex-col gap-2 p-4 rounded-xl transition-all hover:scale-[1.02] hover:shadow-sm ${action.colorClasses}`}
          >
            <img src={action.icon} alt="" width={22} height={22} className="dark:invert shrink-0" />
            <span className="font-semibold text-sm">{action.label}</span>
            <span className="text-xs opacity-60">{action.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default SeniorTeacherQuickActions;
