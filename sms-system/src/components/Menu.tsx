import { role } from "@/lib/data";
import { NavLink } from "react-router-dom";

const menuItems = [
  {
    title: "MENU",
    items: [
      {
        icon: "/home.png",
        label: "Home",
        href: "/",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/teacher.png",
        label: "Teachers",
        href: "/list/teachers",
        visible: ["admin", "teacher"],
      },
      {
        icon: "/student.png",
        label: "Students",
        href: "/list/students",
        visible: ["admin", "teacher"],
      },
      {
        icon: "/parent.png",
        label: "Parents",
        href: "/list/parents",
        visible: ["admin", "teacher"],
      },
      {
        icon: "/subject.png",
        label: "Subjects",
        href: "/list/subjects",
        visible: ["admin"],
      },
      {
        icon: "/class.png",
        label: "Classes",
        href: "/list/classes",
        visible: ["admin", "teacher"],
      },
      {
        icon: "/lesson.png",
        label: "Lessons",
        href: "/list/lessons",
        visible: ["admin", "teacher"],
      },
      {
        icon: "/exam.png",
        label: "Exams",
        href: "/list/exams",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/assignment.png",
        label: "Assignments",
        href: "/list/assignments",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/result.png",
        label: "Results",
        href: "/list/results",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/attendance.png",
        label: "Attendance",
        href: "/list/attendance",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/calendar.png",
        label: "Events",
        href: "/list/events",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/message.png",
        label: "Messages",
        href: "/list/messages",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/announcement.png",
        label: "Announcements",
        href: "/list/announcements",
        visible: ["admin", "teacher", "student", "parent"],
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
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/setting.png",
        label: "Settings",
        href: "/settings",
        visible: ["admin", "teacher", "student", "parent"],
      },
      {
        icon: "/logout.png",
        label: "Logout",
        href: "/logout",
        visible: ["admin", "teacher", "student", "parent"],
      },
    ],
  },
];

const Menu = () => {
  return (
    <nav aria-label="Main navigation" className="mt-4 text-sm text-gray-600 dark:text-gray-300">
      {menuItems.map((i) => (
        <div className="flex flex-col gap-2" key={i.title}>
          <h2 className="hidden lg:block text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold my-3 px-2">
            {i.title}
          </h2>
          {i.items.map((item) => {
            if (item.visible.includes(role)) {
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
