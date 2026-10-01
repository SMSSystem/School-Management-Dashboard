import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

export type QuickAction = {
  label: string;
  description: string;
  Icon: LucideIcon;
  href: string;
  colorClasses: string;
};

export const SKY_CARD =
  "text-sky-700 bg-lamaSkyLight dark:bg-sky-900/20 dark:text-sky-300 border border-lamaSky dark:border-sky-800";
export const YELLOW_CARD =
  "text-yellow-700 bg-lamaYellowLight dark:bg-yellow-900/20 dark:text-yellow-300 border border-lamaYellow dark:border-yellow-800";
export const PURPLE_CARD =
  "text-purple-700 bg-lamaPurpleLight dark:bg-purple-900/20 dark:text-purple-300 border border-lamaPurple dark:border-purple-800";

// Shared card grid behind the senior-teacher, student, and parent dashboards'
// Quick Actions panels — each passes its own role-specific list.
const QuickActionsPanel = ({ actions }: { actions: QuickAction[] }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Quick Actions</h2>
    <div className="grid grid-cols-2 gap-3">
      {actions.map((action) => (
        <Link
          key={action.label}
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

export default QuickActionsPanel;
