import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { getPersistedFilter, setPersistedFilter } from "@/lib/filterPersistence";
import { useNextStep } from "nextstepjs";
import {
  ChevronLeft,
  ChevronRight,
  Route,
} from "lucide-react";
import { findActiveSectionTitle, menuSections, STUDENT_TEMPORARILY_HIDDEN } from "@/lib/sidebarNav";

interface MenuProps {
  collapsed?: boolean;
  onToggle?: () => void;
  // Rendered inside the mobile drawer: no collapse toggle, roomier tap targets.
  mobile?: boolean;
}

// Collapsed/expanded state per group title, kept in sessionStorage (per tab,
// cleared on logout with the other persisted filters). "1" = open, "0" = closed.
const SIDEBAR_PERSIST_PAGE = "sidebar";

const Menu = ({ collapsed = false, onToggle, mobile = false }: MenuProps) => {
  const { role, institution } = useAuth();
  const { pathname } = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const section of menuSections) {
      if (!section.title) continue;
      const persisted = getPersistedFilter(SIDEBAR_PERSIST_PAGE, section.title);
      initial[section.title] = persisted === "" ? true : persisted === "1"; // default: open
    }
    return initial;
  });

  // TEMPORARY: nothing renders the group headers yet (that is the render step), so
  // the toggle is unused for now. Remove the `void` below when it is wired up.
  const toggleGroup = (title: string) => {
    const next = !openGroups[title];
    setOpenGroups((prev) => ({ ...prev, [title]: next }));
    setPersistedFilter(SIDEBAR_PERSIST_PAGE, title, next ? "1" : "0");
  };
  void toggleGroup;

  // One-time nudge on navigation (or role change): open the group holding the
  // current route. Not a render-time override, so a user can still collapse it.
  useEffect(() => {
    const title = findActiveSectionTitle(pathname, role);
    if (!title) return;
    setOpenGroups((prev) => (prev[title] ? prev : { ...prev, [title]: true }));
    setPersistedFilter(SIDEBAR_PERSIST_PAGE, title, "1");
  }, [pathname, role]);

  const { startNextStep } = useNextStep();
  const navigate = useNavigate();
  const hideForStudent = (label: string) =>
    role === "student" && STUDENT_TEMPORARILY_HIDDEN.has(label);
  const profileIncomplete =
    role === "institution_admin" &&
    institution != null &&
    !institution.profileComplete;

  return (
    <nav
      aria-label="Main navigation"
      className={`flex flex-col gap-0.5 py-3 ${collapsed ? "px-1.5" : "px-3"}`}
    >
      {/* Collapse toggle (desktop only — the mobile drawer is always open) */}
      <div className={`${mobile ? "hidden" : "flex"} mb-2 ${collapsed ? "justify-center" : "justify-end"}`}>
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

      {menuSections.map((section) => {
        const visibleItems = section.items.filter(
          (item) => role && item.visible.includes(role) && !hideForStudent(item.label)
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
                      "group flex items-center gap-2.5 rounded-lg transition-all duration-150 text-[13px] font-medium",
                      mobile ? "min-h-11 py-2.5 text-sm" : "py-2",
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

      {/* Start Tour button (temporarily hidden for students, UI-only) */}
      {role !== "student" && (
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
      )}
    </nav>
  );
};

export default Menu;
