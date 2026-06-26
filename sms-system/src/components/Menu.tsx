import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useNextStep } from "nextstepjs";
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
  BarChart2,
  MessageSquare,
  MessageSquarePlus,
  FileBarChart2,
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
  ChevronLeft,
  ChevronRight,
  Route,
  type LucideIcon,
} from "lucide-react";

type MenuItem = {
  Icon: LucideIcon;
  label: string;
  href: string;
  visible: string[];
  id?: string;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

const menuItems: MenuSection[] = [
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
        label: "Create User",
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
        href: "/dashboard/list/lessons",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
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
    ],
  },
  {
    title: "OUTCOMES",
    items: [
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

interface MenuProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

const Menu = ({ collapsed = false, onToggle }: MenuProps) => {
  const { role, institution } = useAuth();
  const { startNextStep } = useNextStep();
  const navigate = useNavigate();
  const profileIncomplete =
    role === "institution_admin" &&
    institution != null &&
    !institution.profileComplete;

  return (
    <nav
      aria-label="Main navigation"
      className={`flex flex-col gap-0.5 py-3 ${collapsed ? "px-1.5" : "px-3"}`}
    >
      {/* Collapse toggle */}
      <div className={`flex mb-2 ${collapsed ? "justify-center" : "justify-end"}`}>
        <button
          id="tour-sidebar-collapse-toggle"
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-600 dark:hover:text-slate-400 dark:hover:bg-slate-800 transition-all duration-150"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {menuItems.map((section) => {
        const visibleItems = section.items.filter(
          (item) => role && item.visible.includes(role)
        );
        if (visibleItems.length === 0) return null;

        return (
          <div key={section.title || "home"} className="flex flex-col">
            {section.title && !collapsed && (
              <h2 className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-600 font-semibold mt-4 mb-1 px-2.5">
                {section.title}
              </h2>
            )}
            {section.title && collapsed && (
              <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
            )}

            {visibleItems.map((item) => {
              const { Icon } = item;
              return (
                <NavLink
                  to={item.href}
                  key={item.label}
                  id={item.id}
                  end={item.href === "/dashboard"}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    [
                      "group flex items-center gap-2.5 py-2 rounded-lg transition-all duration-150 text-[13px] font-medium",
                      collapsed ? "justify-center px-2" : "px-2.5",
                      isActive
                        ? "nav-item-active"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
                    ].join(" ")
                  }
                >
                  <Icon className="shrink-0 w-4 h-4 transition-transform duration-150 group-hover:scale-105" />

                  {!collapsed && (
                    <span className="truncate leading-none">{item.label}</span>
                  )}

                  {item.href === "/dashboard/institution-profile" &&
                    profileIncomplete &&
                    !collapsed && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                    )}
                </NavLink>
              );
            })}
          </div>
        );
      })}

      {/* Start Tour button */}
      <div className={`mt-auto pt-4 border-t border-slate-200 dark:border-slate-800 ${collapsed ? "flex justify-center" : ""}`}>
        <button
          id="tour-sidebar-start-tour"
          type="button"
          onClick={() => { navigate('/dashboard'); startNextStep(role ?? ''); }}
          title="Start Tour"
          aria-label="Start Tour"
          className={`group flex items-center gap-2.5 py-2 rounded-lg transition-all duration-150 text-[13px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${collapsed ? "justify-center px-2" : "px-2.5 w-full"}`}
        >
          <Route className="shrink-0 w-4 h-4 transition-transform duration-150 group-hover:scale-105" />
          {!collapsed && <span className="truncate leading-none">Start Tour</span>}
        </button>
      </div>
    </nav>
  );
};

export default Menu;
