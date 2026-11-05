import { matchPath } from "react-router-dom";
import {
  LayoutDashboard,
  UserPlus,
  GraduationCap,
  BookOpen,
  Users,
  BookMarked,
  Building2,
  Home,
  LayoutGrid,
  CalendarRange,
  CalendarDays,
  Presentation,
  ClipboardList,
  FileText,
  Table2,
  BarChart2,
  MessageSquare,
  MessageSquarePlus,
  FileBarChart2,
  FileClock,
  SlidersHorizontal,
  ListChecks,
  ClipboardCheck,
  LayoutList,
  BookCheck,
  UserCheck,
  UserCog,
  RefreshCw,
  Database,
  CircleUser,
  Palette,
  Building,
  Info,
  Gavel,
  UserPlus2,
  Upload,
  Rows3,
  Eye,
  type LucideIcon,
} from "lucide-react";

export type MenuItem = {
  Icon: LucideIcon;
  label: string;
  href: string;
  visible: string[];
  id?: string;
};

export type MenuSection = {
  title: string;
  items: MenuItem[];
};

export const menuSections: MenuSection[] = [
  {
    title: "",
    items: [
      {
        Icon: LayoutDashboard,
        label: "Home",
        href: "/dashboard",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-home",
      },
    ],
  },
  {
    title: "PEOPLE",
    items: [
      {
        Icon: UserPlus,
        label: "Create Account",
        href: "/dashboard/create-user",
        visible: ["super_admin", "institution_admin"],
        id: "tour-sidebar-nav-create-user",
      },
      {
        Icon: GraduationCap,
        label: "Teachers",
        href: "/dashboard/list/teachers",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
        ],
        id: "tour-sidebar-nav-teachers",
      },
      {
        Icon: BookOpen,
        label: "Students",
        href: "/dashboard/list/students",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
        ],
        id: "tour-sidebar-nav-students",
      },
      {
        Icon: Users,
        label: "Parents",
        href: "/dashboard/list/parents",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
        ],
        id: "tour-sidebar-nav-parents",
      },
      {
        Icon: Eye,
        label: "Spectators",
        href: "/dashboard/list/spectators",
        visible: ["super_admin", "institution_admin"],
        id: "tour-sidebar-nav-spectators",
      },
    ],
  },
  {
    title: "CURRICULUM",
    items: [
      {
        Icon: BookMarked,
        label: "Subjects",
        href: "/dashboard/list/subjects",
        visible: ["super_admin", "institution_admin", "spectator"],
        id: "tour-sidebar-nav-subjects",
      },
      {
        Icon: Building2,
        label: "Departments",
        href: "/dashboard/list/departments",
        visible: ["super_admin", "institution_admin", "spectator"],
        id: "tour-sidebar-nav-departments",
      },
      {
        Icon: Home,
        label: "Houses",
        href: "/dashboard/list/houses",
        visible: ["institution_admin", "spectator"],
        id: "tour-sidebar-nav-houses",
      },
      {
        Icon: LayoutGrid,
        label: "Classes",
        href: "/dashboard/list/classes",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
        ],
        id: "tour-sidebar-nav-classes",
      },
    ],
  },
  {
    title: "TIMETABLE",
    items: [
      {
        Icon: CalendarRange,
        label: "Terms",
        href: "/dashboard/list/terms",
        visible: ["super_admin", "institution_admin", "spectator"],
        id: "tour-sidebar-nav-terms",
      },
      {
        Icon: CalendarDays,
        label: "Schedule",
        href: "/dashboard/schedule",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-schedule",
      },
      {
        Icon: Presentation,
        label: "Lessons",
        href: "/dashboard/list/lesson-notes",
        visible: [
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-lessons",
      },
      {
        Icon: ClipboardList,
        label: "Exams",
        href: "/dashboard/list/exams",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-exams",
      },
      {
        Icon: FileText,
        label: "Assignments",
        href: "/dashboard/list/assignments",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-assignments",
      },
      {
        Icon: Rows3,
        label: "Rubrics",
        href: "/dashboard/list/rubrics",
        // Not super_admin: there is no institution picker yet, so the page would have nothing to load.
        visible: [
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
        ],
        id: "tour-sidebar-nav-rubrics",
      },
    ],
  },
  {
    title: "OUTCOMES",
    items: [
      {
        Icon: Table2,
        label: "Gradebook",
        href: "/dashboard/list/gradebook",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
        ],
      },
      {
        Icon: BarChart2,
        label: "Results",
        href: "/dashboard/list/results",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-results",
      },
      {
        Icon: MessageSquare,
        label: "Feedback",
        href: "/dashboard/list/feedback",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
        ],
        id: "tour-sidebar-nav-feedback",
      },
      {
        Icon: Gavel,
        label: "Disciplinary Action",
        href: "/dashboard/disciplinary-actions",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-disciplinary-actions",
      },
      {
        Icon: ListChecks,
        label: "Grade Tracking",
        href: "/dashboard/admin/grade-entry-tracking",
        visible: ["super_admin", "institution_admin", "spectator"],
        id: "tour-sidebar-nav-grade-tracking",
      },
    ],
  },
  {
    title: "REPORTS",
    items: [
      {
        Icon: MessageSquarePlus,
        label: "Report Card Comments",
        href: "/dashboard/report-card-comments",
        visible: ["institution_admin", "spectator"],
        id: "tour-sidebar-nav-report-card-comments",
      },
      {
        Icon: FileBarChart2,
        label: "Report Cards",
        href: "/dashboard/report-cards",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-report-cards",
      },
      {
        Icon: FileClock,
        label: "Progress Reports",
        href: "/dashboard/progress-reports",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-progress-reports",
      },
      {
        Icon: SlidersHorizontal,
        label: "Report Builder",
        href: "/dashboard/reports/builder",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
        ],
        id: "tour-sidebar-nav-report-builder",
      },
    ],
  },
  {
    title: "ATTENDANCE",
    items: [
      {
        Icon: ClipboardCheck,
        label: "General Register",
        href: "/dashboard/attendance/general",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
        ],
        id: "tour-sidebar-nav-general-register",
      },
      {
        Icon: LayoutList,
        label: "Summary Register",
        href: "/dashboard/attendance/gridsheet",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
        ],
        id: "tour-sidebar-nav-summary-register",
      },
      {
        Icon: BookCheck,
        label: "Subject Register",
        href: "/dashboard/attendance/subject",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "regular_teacher",
        ],
        id: "tour-sidebar-nav-subject-register",
      },
      {
        Icon: UserCheck,
        label: "My Attendance",
        href: "/dashboard/attendance/my",
        visible: ["student"],
      },
      {
        Icon: UserCog,
        label: "Child Attendance",
        href: "/dashboard/attendance/child",
        visible: ["parent"],
      },
    ],
  },
  {
    title: "ADMINISTRATION",
    items: [
      {
        Icon: UserPlus2,
        label: "Registrations",
        href: "/dashboard/registrations",
        visible: ["super_admin", "institution_admin", "spectator"],
        id: "tour-sidebar-nav-registrations",
      },
      {
        Icon: CalendarDays,
        label: "Academic Calendar",
        href: "/dashboard/academic-calendar",
        visible: ["institution_admin", "spectator"],
        id: "tour-sidebar-nav-academic-calendar",
      },
      {
        Icon: RefreshCw,
        label: "Backfill Classes",
        href: "/dashboard/admin/backfill-student-classes",
        visible: ["super_admin", "institution_admin"],
        id: "tour-sidebar-nav-backfill-classes",
      },
      {
        Icon: Upload,
        label: "Import Data",
        href: "/dashboard/import",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
        ],
        id: "tour-sidebar-nav-import",
      },
      {
        Icon: Database,
        label: "Rebuild Summaries",
        href: "/dashboard/admin/rebuild-attendance-summaries",
        visible: ["institution_admin"],
        id: "tour-sidebar-nav-rebuild-summaries",
      },
      {
        Icon: FileClock,
        label: "Audit Log",
        href: "/dashboard/admin/audit-log",
        visible: ["super_admin", "institution_admin", "spectator"],
      },
    ],
  },
  {
    title: "OTHER",
    items: [
      {
        Icon: CircleUser,
        label: "User Profile",
        href: "/dashboard/profile",
        visible: [
          "super_admin",
          "institution_admin",
          "spectator",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-profile",
      },
      {
        Icon: Palette,
        label: "Brand Settings",
        href: "/dashboard/brand-settings",
        visible: ["super_admin"],
        id: "tour-sidebar-nav-brand-settings",
      },
      {
        Icon: Building,
        label: "Institution Profile",
        href: "/dashboard/institution-profile",
        visible: ["institution_admin"],
        id: "tour-sidebar-nav-institution-profile",
      },
      {
        Icon: Info,
        label: "Institution Info",
        href: "/dashboard/institution-profile",
        visible: [
          "spectator",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-institution-info",
      },
    ],
  },
];

// TEMPORARY, UI-ONLY: sidebar items students should not see for now. The routes
// and firestore.rules are untouched (the pages still load by URL); this only
// stops the links rendering. Delete an entry here to bring it back.
export const STUDENT_TEMPORARILY_HIDDEN = new Set([
  "Report Cards",
  "Progress Reports",
  "Disciplinary Action",
]);

// TEMPORARY, UI-ONLY: sidebar items the teacher roles should not see. The rules let
// a teacher read students only, so the Teachers and Parents lists stay empty for
// them. The routes and firestore.rules are untouched; this only stops the links
// rendering. Delete an entry here to bring it back.
export const TEACHER_TEMPORARILY_HIDDEN = new Set(["Teachers", "Parents"]);

const TEACHER_ROLES = new Set(["senior_teacher", "regular_teacher"]);

// Same rule NavLink uses: segment-aware prefix match, with "/dashboard" exact.
export function isItemActive(href: string, pathname: string): boolean {
  return (
    matchPath({ path: href, end: href === "/dashboard" }, pathname) !== null
  );
}

// Items this role actually sees: role-gated, minus the student and teacher temporary hides.
export function visibleItems(
  section: MenuSection,
  role: string | null,
): MenuItem[] {
  return section.items.filter(
    (item) =>
      role &&
      item.visible.includes(role) &&
      !(role === "student" && STUDENT_TEMPORARILY_HIDDEN.has(item.label)) &&
      !(TEACHER_ROLES.has(role) && TEACHER_TEMPORARILY_HIDDEN.has(item.label)),
  );
}

// The titled group containing the current route, among items this role can see.
export function findActiveSectionTitle(
  pathname: string,
  role: string | null,
): string | null {
  const section = menuSections.find(
    (s) =>
      s.title &&
      visibleItems(s, role).some((i) => isItemActive(i.href, pathname)),
  );
  return section?.title ?? null;
}

// A group collapses only when this role sees two or more of its items: toggling a
// single link saves nothing. The untitled Home section never collapses.
export function isGroupCollapsible(
  section: MenuSection,
  role: string | null,
): boolean {
  return !!section.title && visibleItems(section, role).length >= 2;
}

// True when one of the group's visible items is flagged as needing attention (today only
// Institution Profile while the institution profile is incomplete). Lets a collapsed
// group's header carry the indicator its hidden item would have shown.
export function groupNeedsAttention(
  section: MenuSection,
  role: string | null,
  attentionLabels: ReadonlySet<string>,
): boolean {
  return visibleItems(section, role).some((item) =>
    attentionLabels.has(item.label),
  );
}
