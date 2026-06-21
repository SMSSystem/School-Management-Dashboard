import { NavLink } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
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
  type LucideIcon,
} from "lucide-react";

type MenuItem = {
  Icon: LucideIcon;
  label: string;
  href: string;
  visible: string[];
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
        href: "/",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
      },
    ],
  },
  {
    title: "PEOPLE",
    items: [
      {
        Icon: UserPlus,
        label: "Create User",
        href: "/create-user",
        visible: ["super_admin", "institution_admin"],
      },
      {
        Icon: GraduationCap,
        label: "Teachers",
        href: "/list/teachers",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
        ],
      },
      {
        Icon: BookOpen,
        label: "Students",
        href: "/list/students",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
        ],
      },
      {
        Icon: Users,
        label: "Parents",
        href: "/list/parents",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
        ],
      },
    ],
  },
  {
    title: "CURRICULUM",
    items: [
      {
        Icon: BookMarked,
        label: "Subjects",
        href: "/list/subjects",
        visible: ["super_admin", "institution_admin"],
      },
      {
        Icon: Building2,
        label: "Departments",
        href: "/list/departments",
        visible: ["super_admin", "institution_admin"],
      },
      {
        Icon: Home,
        label: "Houses",
        href: "/list/houses",
        visible: ["institution_admin"],
      },
      {
        Icon: LayoutGrid,
        label: "Classes",
        href: "/list/classes",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
        ],
      },
    ],
  },
  {
    title: "TIMETABLE",
    items: [
      {
        Icon: CalendarRange,
        label: "Terms",
        href: "/list/terms",
        visible: ["super_admin", "institution_admin"],
      },
      {
        Icon: CalendarDays,
        label: "Schedule",
        href: "/schedule",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
      },
      {
        Icon: Presentation,
        label: "Lessons",
        href: "/list/lessons",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
        ],
      },
      {
        Icon: ClipboardList,
        label: "Exams",
        href: "/list/exams",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
      },
      {
        Icon: FileText,
        label: "Assignments",
        href: "/list/assignments",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
      },
    ],
  },
  {
    title: "OUTCOMES",
    items: [
      {
        Icon: BarChart2,
        label: "Results",
        href: "/list/results",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
      },
      {
        Icon: MessageSquare,
        label: "Feedback",
        href: "/list/feedback",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
        ],
      },
      {
        Icon: MessageSquarePlus,
        label: "Report Card Comments",
        href: "/report-card-comments",
        visible: ["institution_admin"],
      },
      {
        Icon: FileBarChart2,
        label: "Report Cards",
        href: "/report-cards",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
      },
    ],
  },
  {
    title: "ATTENDANCE",
    items: [
      {
        Icon: CalendarDays,
        label: "Academic Calendar",
        href: "/academic-calendar",
        visible: ["institution_admin"],
      },
      {
        Icon: ClipboardCheck,
        label: "General Register",
        href: "/attendance/general",
        visible: ["super_admin", "institution_admin", "senior_teacher"],
      },
      {
        Icon: LayoutList,
        label: "Summary Register",
        href: "/attendance/gridsheet",
        visible: ["super_admin", "institution_admin", "senior_teacher"],
      },
      {
        Icon: BookCheck,
        label: "Subject Register",
        href: "/attendance/subject",
        visible: ["super_admin", "institution_admin", "regular_teacher"],
      },
      {
        Icon: UserCheck,
        label: "My Attendance",
        href: "/attendance/my",
        visible: ["student"],
      },
      {
        Icon: UserCog,
        label: "Child Attendance",
        href: "/attendance/child",
        visible: ["parent"],
      },
      {
        Icon: RefreshCw,
        label: "Backfill Classes",
        href: "/admin/backfill-student-classes",
        visible: ["super_admin", "institution_admin"],
      },
      {
        Icon: Database,
        label: "Rebuild Summaries",
        href: "/admin/rebuild-attendance-summaries",
        visible: ["institution_admin"],
      },
    ],
  },
  {
    title: "OTHER",
    items: [
      {
        Icon: CircleUser,
        label: "User Profile",
        href: "/profile",
        visible: [
          "super_admin",
          "institution_admin",
          "senior_teacher",
          "regular_teacher",
          "student",
          "parent",
        ],
      },
      {
        Icon: Palette,
        label: "Brand Settings",
        href: "/brand-settings",
        visible: ["super_admin"],
      },
      {
        Icon: Building,
        label: "Institution Profile",
        href: "/institution-profile",
        visible: ["institution_admin"],
      },
      {
        Icon: Info,
        label: "Institution Info",
        href: "/institution-profile",
        visible: ["senior_teacher", "regular_teacher", "student", "parent"],
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
  const profileIncomplete =
    role === "institution_admin" &&
    institution != null &&
    !institution.profileComplete;

  return (
    <nav aria-label="Main navigation" className={`flex flex-col gap-0.5 ${collapsed ? "px-1" : "px-2"}`}>
      {/* Collapse toggle */}
      <div className={`flex mb-1 ${collapsed ? "justify-center" : "justify-end"}`}>
        <button
          onClick={onToggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="w-7 h-7 flex items-center justify-center rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-all duration-200"
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
              <h2 className="text-[10px] uppercase tracking-[0.12em] text-white/40 font-semibold mt-5 mb-1.5 px-3">
                {section.title}
              </h2>
            )}
            {/* Collapsed: small divider between sections */}
            {section.title && collapsed && (
              <div className="my-2 mx-2 border-t border-white/15" />
            )}

            {visibleItems.map((item) => {
              const { Icon } = item;
              return (
                <NavLink
                  to={item.href}
                  key={item.label}
                  end={item.href === "/"}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    [
                      "group relative flex items-center gap-3 py-2.5 rounded-lg transition-all duration-200 ease-out",
                      collapsed ? "justify-center px-0" : "justify-start px-3",
                      isActive
                        ? "bg-white/15 text-white shadow-sm"
                        : "text-white/70 hover:bg-white/10 hover:text-white",
                    ].join(" ")
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={[
                          "absolute left-0 top-1/2 -translate-y-1/2 w-0.75 rounded-r-full transition-all duration-200",
                          isActive
                            ? "h-5 bg-white opacity-100"
                            : "h-3 bg-white opacity-0 group-hover:opacity-40 group-hover:h-4",
                        ].join(" ")}
                      />

                      <Icon
                        className={[
                          "shrink-0 w-4.5 h-4.5 transition-transform duration-200 group-hover:scale-110",
                          isActive ? "scale-110" : "",
                        ].join(" ")}
                      />

                      {!collapsed && (
                        <span className="text-[13px] font-medium truncate leading-none">
                          {item.label}
                        </span>
                      )}

                      {item.href === "/institution-profile" &&
                        profileIncomplete &&
                        !collapsed && (
                          <span className="ml-auto h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                        )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
};

export default Menu;
