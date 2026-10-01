import { Presentation, ClipboardList, BarChart2, LayoutGrid } from "lucide-react";
import QuickActionsPanel, {
  PURPLE_CARD,
  SKY_CARD,
  YELLOW_CARD,
  type QuickAction,
} from "./QuickActionsPanel";

const quickActions: QuickAction[] = [
  {
    label: "View My Lessons",
    description: "Browse and manage your lesson notes",
    Icon: Presentation,
    href: "/dashboard/list/lesson-notes",
    colorClasses: SKY_CARD,
  },
  {
    label: "Manage Exams",
    description: "Create and edit department exams",
    Icon: ClipboardList,
    href: "/dashboard/list/exams",
    colorClasses: YELLOW_CARD,
  },
  {
    label: "Grade Results",
    description: "Enter and review student results",
    Icon: BarChart2,
    href: "/dashboard/list/results",
    colorClasses: PURPLE_CARD,
  },
  {
    label: "Department Classes",
    description: "View all classes in your department",
    Icon: LayoutGrid,
    href: "/dashboard/list/classes",
    colorClasses: SKY_CARD,
  },
];

const SeniorTeacherQuickActions = () => <QuickActionsPanel actions={quickActions} />;

export default SeniorTeacherQuickActions;
