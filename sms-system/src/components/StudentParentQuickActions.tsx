import { Presentation, FileText, BarChart2, UserCheck, UserCog } from "lucide-react";
import QuickActionsPanel, {
  PURPLE_CARD,
  SKY_CARD,
  YELLOW_CARD,
  type QuickAction,
} from "./QuickActionsPanel";

const LESSONS_HREF = "/dashboard/list/lesson-notes";

const studentActions: QuickAction[] = [
  {
    label: "View My Lessons",
    description: "Notes, files, and links for your class",
    Icon: Presentation,
    href: LESSONS_HREF,
    colorClasses: SKY_CARD,
  },
  {
    label: "Assignments",
    description: "See and submit your assignments",
    Icon: FileText,
    href: "/dashboard/list/assignments",
    colorClasses: YELLOW_CARD,
  },
  {
    label: "Results",
    description: "Check your exam and assessment results",
    Icon: BarChart2,
    href: "/dashboard/list/results",
    colorClasses: PURPLE_CARD,
  },
  {
    label: "My Attendance",
    description: "Review your attendance record",
    Icon: UserCheck,
    href: "/dashboard/attendance/my",
    colorClasses: SKY_CARD,
  },
];

// Same layout as the student panel; the lessons card is worded for a parent.
const parentActions: QuickAction[] = [
  {
    label: "View Lessons",
    description: "Notes, files, and links for your child's class",
    Icon: Presentation,
    href: LESSONS_HREF,
    colorClasses: SKY_CARD,
  },
  {
    label: "Assignments",
    description: "Follow your child's assignments",
    Icon: FileText,
    href: "/dashboard/list/assignments",
    colorClasses: YELLOW_CARD,
  },
  {
    label: "Results",
    description: "Check your child's results",
    Icon: BarChart2,
    href: "/dashboard/list/results",
    colorClasses: PURPLE_CARD,
  },
  {
    label: "Child Attendance",
    description: "Review your child's attendance record",
    Icon: UserCog,
    href: "/dashboard/attendance/child",
    colorClasses: SKY_CARD,
  },
];

export const StudentQuickActions = () => <QuickActionsPanel actions={studentActions} />;
export const ParentQuickActions = () => <QuickActionsPanel actions={parentActions} />;
