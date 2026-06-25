import { Link } from "react-router-dom";
import { GraduationCap, BookOpen, LayoutGrid, Megaphone, type LucideIcon } from "lucide-react";

const quickActions: { label: string; description: string; Icon: LucideIcon; href: string; colorClasses: string; id: string }[] = [
  {
    label: "Add Teacher",
    description: "Register a new teacher",
    Icon: GraduationCap,
    href: "/dashboard/list/teachers",
    colorClasses:
      "text-sky-700 bg-lamaSkyLight dark:bg-sky-900/20 dark:text-sky-300 border border-lamaSky dark:border-sky-800",
    id: "tour-home-quick-action-teacher",
  },
  {
    label: "Add Student",
    description: "Enrol a new student",
    Icon: BookOpen,
    href: "/dashboard/list/students",
    colorClasses:
      "text-yellow-700 bg-lamaYellowLight dark:bg-yellow-900/20 dark:text-yellow-300 border border-lamaYellow dark:border-yellow-800",
    id: "tour-home-quick-action-student",
  },
  {
    label: "Manage Classes",
    description: "View and edit classes",
    Icon: LayoutGrid,
    href: "/dashboard/list/classes",
    colorClasses:
      "text-purple-700 bg-lamaPurpleLight dark:bg-purple-900/20 dark:text-purple-300 border border-lamaPurple dark:border-purple-800",
    id: "tour-home-quick-action-classes",
  },
  {
    label: "Announcements",
    description: "Post or review announcements",
    Icon: Megaphone,
    href: "/dashboard/list/announcements",
    colorClasses:
      "text-sky-700 bg-lamaSkyLight dark:bg-sky-900/20 dark:text-sky-300 border border-lamaSky dark:border-sky-800",
    id: "tour-home-quick-action-announcements",
  },
];

const AdminQuickActions = () => {
  return (
    <div id="tour-home-quick-actions" className="bg-white dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-3">
        {quickActions.map((action) => (
          <Link
            key={action.label}
            id={action.id}
            to={action.href}
            className={`flex flex-col gap-2 p-4 rounded-xl transition-all hover:scale-[1.02] hover:shadow-sm ${action.colorClasses}`}
          >
            <action.Icon className="w-5 h-5 shrink-0" />
            <span className="font-semibold text-sm">{action.label}</span>
            <span className="text-xs opacity-60">{action.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default AdminQuickActions;
