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
          "senior_teacher",
          "regular_teacher",
        ],
        id: "tour-sidebar-nav-parents",
      },
      {
        Icon: UserPlus2,
        label: "Registrations",
        href: "/dashboard/registrations",
        visible: ["super_admin", "institution_admin"],
        id: "tour-sidebar-nav-registrations",
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
        visible: ["super_admin", "institution_admin"],
        id: "tour-sidebar-nav-subjects",
      },
      {
        Icon: Building2,
        label: "Departments",
        href: "/dashboard/list/departments",
        visible: ["super_admin", "institution_admin"],
        id: "tour-sidebar-nav-departments",
      },
      {
        Icon: Home,
        label: "Houses",
        href: "/dashboard/list/houses",
        visible: ["institution_admin"],
        id: "tour-sidebar-nav-houses",
      },
      {
        Icon: LayoutGrid,
        label: "Classes",
        href: "/dashboard/list/classes",
        visible: [
          "super_admin",
          "institution_admin",
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
        visible: ["super_admin", "institution_admin"],
        id: "tour-sidebar-nav-terms",
      },
      {
        Icon: CalendarDays,
        label: "Schedule",
        href: "/dashboard/schedule",
        visible: [
          "super_admin",
          "institution_admin",
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
        visible: [
          "super_admin",
          "institution_admin",
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
          "senior_teacher",
          "regular_teacher",
        ],
        id: "tour-sidebar-nav-feedback",
      },
      {
        Icon: MessageSquarePlus,
        label: "Report Card Comments",
        href: "/dashboard/report-card-comments",
        visible: ["institution_admin"],
        id: "tour-sidebar-nav-report-card-comments",
      },
      {
        Icon: FileBarChart2,
        label: "Report Cards",
        href: "/dashboard/report-cards",
        visible: [
          "super_admin",
          "institution_admin",
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
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-progress-reports",
      },
      {
        Icon: Gavel,
        label: "Disciplinary Action",
        href: "/dashboard/disciplinary-actions",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
        id: "tour-sidebar-nav-disciplinary-actions",
      },
      {
        Icon: SlidersHorizontal,
        label: "Report Builder",
        href: "/dashboard/reports/builder",
        visible: ["super_admin", "institution_admin", "senior_teacher"],
        id: "tour-sidebar-nav-report-builder",
      },
      {
        Icon: ListChecks,
        label: "Grade Tracking",
        href: "/dashboard/admin/grade-entry-tracking",
        visible: ["super_admin", "institution_admin"],
        id: "tour-sidebar-nav-grade-tracking",
      },
      {
        Icon: Upload,
        label: "Import Data",
        href: "/dashboard/import",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher"],
        id: "tour-sidebar-nav-import",
      },
    ],
  },
  {
    title: "ATTENDANCE",
    items: [
      {
        Icon: CalendarDays,
        label: "Academic Calendar",
        href: "/dashboard/academic-calendar",
        visible: ["institution_admin"],
        id: "tour-sidebar-nav-academic-calendar",
      },
      {
        Icon: ClipboardCheck,
        label: "General Register",
        href: "/dashboard/attendance/general",
        visible: ["super_admin", "institution_admin", "senior_teacher"],
        id: "tour-sidebar-nav-general-register",
      },
      {
        Icon: LayoutList,
        label: "Summary Register",
        href: "/dashboard/attendance/gridsheet",
        visible: ["super_admin", "institution_admin", "senior_teacher"],
        id: "tour-sidebar-nav-summary-register",
      },
      {
        Icon: BookCheck,
        label: "Subject Register",
        href: "/dashboard/attendance/subject",
        visible: ["super_admin", "institution_admin", "regular_teacher"],
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
      {
        Icon: RefreshCw,
        label: "Backfill Classes",
        href: "/dashboard/admin/backfill-student-classes",
        visible: ["super_admin", "institution_admin"],
        id: "tour-sidebar-nav-backfill-classes",
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
        visible: ["super_admin", "institution_admin"],
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
        visible: ["senior_teacher", "regular_teacher", "student", "parent"],
        id: "tour-sidebar-nav-institution-info",
      },
    ],
  },
];

// TEMPORARY, UI-ONLY: sidebar items students should not see for now. The routes
// and firestore.rules are untouched (the pages still load by URL); this only
// stops the links rendering. Delete an entry here to bring it back.
export const STUDENT_TEMPORARILY_HIDDEN = new Set([
  "Exams",
  "Report Cards",
  "Progress Reports",
  "Disciplinary Action",
]);
