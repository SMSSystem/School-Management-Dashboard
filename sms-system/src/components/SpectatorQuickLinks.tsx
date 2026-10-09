import { Link } from "react-router-dom";
import {
  BookOpen,
  GraduationCap,
  BarChart2,
  FileBarChart2,
  ClipboardCheck,
  FileClock,
  type LucideIcon,
} from "lucide-react";

// The spectator's counterpart of AdminQuickActions: links to read-only views,
// never to create or edit screens (docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md).
const links: { label: string; description: string; Icon: LucideIcon; href: string; colorClasses: string }[] = [
  {
    label: "Students",
    description: "Browse student records",
    Icon: BookOpen,
    href: "/dashboard/list/students",
    colorClasses:
      "text-yellow-700 bg-lamaYellowLight dark:bg-yellow-900/20 dark:text-yellow-300 border border-lamaYellow dark:border-yellow-800",
  },
  {
    label: "Teachers",
    description: "Browse teaching staff",
    Icon: GraduationCap,
    href: "/dashboard/list/teachers",
    colorClasses:
      "text-sky-700 bg-lamaSkyLight dark:bg-sky-900/20 dark:text-sky-300 border border-lamaSky dark:border-sky-800",
  },
  {
    label: "Results",
    description: "View exam and assessment results",
    Icon: BarChart2,
    href: "/dashboard/list/results",
    colorClasses:
      "text-sky-700 bg-lamaSkyLight dark:bg-sky-900/20 dark:text-sky-300 border border-lamaSky dark:border-sky-800",
  },
  {
    label: "Report Cards",
    description: "View saved report cards",
    Icon: FileBarChart2,
    href: "/dashboard/report-cards",
    colorClasses:
      "text-yellow-700 bg-lamaYellowLight dark:bg-yellow-900/20 dark:text-yellow-300 border border-lamaYellow dark:border-yellow-800",
  },
  {
    label: "General Register",
    description: "View attendance registers",
    Icon: ClipboardCheck,
    href: "/dashboard/attendance/general",
    colorClasses:
      "text-yellow-700 bg-lamaYellowLight dark:bg-yellow-900/20 dark:text-yellow-300 border border-lamaYellow dark:border-yellow-800",
  },
  {
    label: "Audit Log",
    description: "Review account and record changes",
    Icon: FileClock,
    href: "/dashboard/admin/audit-log",
    colorClasses:
      "text-sky-700 bg-lamaSkyLight dark:bg-sky-900/20 dark:text-sky-300 border border-lamaSky dark:border-sky-800",
  },
];

const SpectatorQuickLinks = () => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-4 h-full">
    <h2 className="text-lg font-semibold">Quick Links</h2>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {links.map((l) => (
        <Link
          key={l.label}
          to={l.href}
          className={`flex flex-col gap-2 p-4 rounded-xl transition-all hover:scale-[1.02] hover:shadow-sm ${l.colorClasses}`}
        >
          <l.Icon className="w-5 h-5 shrink-0" />
          <span className="font-semibold text-sm">{l.label}</span>
          <span className="text-xs opacity-60">{l.description}</span>
        </Link>
      ))}
    </div>
  </div>
);

export default SpectatorQuickLinks;
