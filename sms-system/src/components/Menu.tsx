import { NavLink } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

const menuItems = [
  {
    title: "MENU",
    items: [
      {
        icon: "/home.png",
        label: "Home",
        href: "/",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
      },
      {
        icon: "/create.png",
        label: "Create User",
        href: "/create-user",
        visible: ["super_admin", "institution_admin"],
      },
      {
        icon: "/teacher.png",
        label: "Teachers",
        href: "/list/teachers",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher"],
      },
      {
        icon: "/student.png",
        label: "Students",
        href: "/list/students",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher"],
      },
      {
        icon: "/parent.png",
        label: "Parents",
        href: "/list/parents",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher"],
      },
      {
        icon: "/subject.png",
        label: "Subjects",
        href: "/list/subjects",
        visible: ["super_admin", "institution_admin"],
      },
      {
        icon: "/subject.png",
        label: "Departments",
        href: "/list/departments",
        visible: ["super_admin", "institution_admin"],
      },
      {
        icon: "/class.png",
        label: "Classes",
        href: "/list/classes",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher"],
      },
      {
        icon: "/calendar.png",
        label: "Terms",
        href: "/list/terms",
        visible: ["super_admin", "institution_admin"],
      },
      {
        icon: "/calendar.png",
        label: "Schedule",
        href: "/schedule",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
      },
      {
        icon: "/lesson.png",
        label: "Lessons",
        href: "/list/lessons",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher"],
      },
      {
        icon: "/exam.png",
        label: "Exams",
        href: "/list/exams",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
      },
      {
        icon: "/assignment.png",
        label: "Assignments",
        href: "/list/assignments",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
      },
      {
        icon: "/result.png",
        label: "Results",
        href: "/list/results",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
      },
      {
        icon: "/message.png",
        label: "Feedback",
        href: "/list/feedback",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher"],
      },
      {
        icon: "/result.png",
        label: "Reports",
        href: "/reports",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
      },
      {
        icon: "/calendar.png",
        label: "Events",
        href: "/list/events",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
      },
      {
        icon: "/announcement.png",
        label: "Announcements",
        href: "/list/announcements",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
      },
    ],
  },
  {
    title: "ATTENDANCE",
    items: [
      {
        icon: "/calendar.png",
        label: "Academic Calendar",
        href: "/academic-calendar",
        visible: ["institution_admin"],
      },
      {
        icon: "/calendar.png",
        label: "General Register",
        href: "/attendance/general",
        visible: ["super_admin", "institution_admin", "senior_teacher"],
      },
      {
        icon: "/calendar.png",
        label: "Subject Register",
        href: "/attendance/subject",
        visible: ["super_admin", "institution_admin", "regular_teacher"],
      },
      {
        icon: "/calendar.png",
        label: "My Attendance",
        href: "/attendance/my",
        visible: ["student"],
      },
      {
        icon: "/calendar.png",
        label: "Child Attendance",
        href: "/attendance/child",
        visible: ["parent"],
      },
      {
        icon: "/class.png",
        label: "Backfill Classes",
        href: "/admin/backfill-student-classes",
        visible: ["super_admin", "institution_admin"],
      },
    ],
  },
  {
    title: "OTHER",
    items: [
      {
        icon: "/profile.png",
        label: "Profile",
        href: "/profile",
        visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
      },
      {
        icon: "/setting.png",
        label: "Brand Settings",
        href: "/brand-settings",
        visible: ["institution_admin"],
      },
      {
        icon: "/profile.png",
        label: "Institution Info",
        href: "/institution-profile",
        visible: ["senior_teacher", "regular_teacher", "student", "parent"],
      },
    ],
  },
];

const Menu = () => {
  const { role } = useAuth();

  return (
    <nav aria-label="Main navigation" className="mt-4 text-sm text-gray-600 dark:text-gray-300">
      {menuItems.map((i) => (
        <div className="flex flex-col gap-2" key={i.title}>
          <h2 className="hidden lg:block text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold my-3 px-2">
            {i.title}
          </h2>
          {i.items.map((item) => {
            if (role && item.visible.includes(role)) {
              return (
                <NavLink
                  to={item.href}
                  key={item.label}
                  className={({ isActive }) => [
                    "relative group flex items-center justify-center lg:justify-start gap-4 py-2 md:px-2 rounded-md transition-all duration-200 ease-out",
                    "hover:bg-lamaSkyLight hover:text-sky-700 hover:translate-x-1 hover:shadow-sm hover:ring-1 hover:ring-sky-100",
                    "dark:hover:bg-gray-800 dark:hover:text-gray-100 dark:hover:ring-gray-700",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:bg-lamaSkyLight focus-visible:translate-x-1",
                    "dark:focus-visible:ring-gray-600 dark:focus-visible:bg-gray-800",
                    isActive ? "bg-lamaSkyLight text-sky-700 translate-x-1 ring-1 ring-sky-100 shadow-sm" : "",
                    isActive ? "dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-700" : "",
                  ].join(" ")}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={[
                          "pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r bg-sky-500 transition-opacity",
                          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                        ].join(" ")}
                      />
                      <img
                        src={item.icon}
                        alt=""
                        width={20}
                        height={20}
                        className="transition-transform duration-200 ease-out group-hover:scale-110 group-hover:rotate-[3deg] group-focus-visible:scale-110 dark:invert"
                      />
                      <span className="hidden lg:block">{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            }
          })}
        </div>
      ))}
    </nav>
  );
};

export default Menu;
