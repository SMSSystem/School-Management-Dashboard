import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { getPersistedFilter, setPersistedFilter } from "@/lib/filterPersistence";
import { prefetchIntent } from "@/routes/lazyPages";
import { useNextStep } from "nextstepjs";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Route,
} from "lucide-react";
import {
  findActiveSectionTitle,
  groupNeedsAttention,
  isGroupCollapsible,
  menuSections,
  visibleItems,
} from "@/lib/sidebarNav";

interface MenuProps {
  collapsed?: boolean;
  onToggle?: () => void;
  // Rendered inside the mobile drawer: no collapse toggle, roomier tap targets.
  mobile?: boolean;
  // Called before an action that navigates on its own (Start Tour), so the layout
  // can close the drawer; it otherwise closes only when the pathname changes.
  onNavigate?: () => void;
}

// Collapsed/expanded state per group title, kept in sessionStorage (per tab,
// cleared on logout with the other persisted filters). "1" = open, "0" = closed.
const SIDEBAR_PERSIST_PAGE = "sidebar";

const Menu = ({ collapsed = false, onToggle, mobile = false, onNavigate }: MenuProps) => {
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

  const toggleGroup = (title: string) => {
    const next = !openGroups[title];
    setOpenGroups((prev) => ({ ...prev, [title]: next }));
    setPersistedFilter(SIDEBAR_PERSIST_PAGE, title, next ? "1" : "0");
  };

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
  const profileIncomplete =
    role === "institution_admin" &&
    institution != null &&
    !institution.profileComplete;
  const attentionLabels = new Set(profileIncomplete ? ["Institution Profile"] : []);

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
        const items = visibleItems(section, role);
        if (items.length === 0) return null;

        // A group with two or more visible items collapses; a one-item group (and
        // Home) keeps a plain heading and is always open. Icon-only mode ignores
        // group state so every icon stays reachable.
        const collapsible = isGroupCollapsible(section, role);
        const slug = section.title.toLowerCase();
        const isOpen = !collapsible || openGroups[section.title];
        const open = collapsed || isOpen;
        // A collapsed group's header carries the dot its hidden item would show.
        const attention = !isOpen && groupNeedsAttention(section, role, attentionLabels);

        return (
          <div key={section.title || "home"} className="flex flex-col">
            {section.title && !collapsed && collapsible && (
              <h2 className="mt-4 mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(section.title)}
                  aria-expanded={isOpen}
                  aria-controls={`sidebar-group-${slug}`}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-400 hover:text-slate-600 dark:text-slate-600 dark:hover:text-slate-400 ${mobile ? "min-h-11" : ""}`}
                >
                  <span className="flex items-center gap-1.5">
                    {section.title}
                    {attention && (
                      <span
                        role="img"
                        aria-label="Needs attention"
                        className="h-2 w-2 rounded-full bg-amber-400 shrink-0"
                      />
                    )}
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 shrink-0 transition-transform duration-150 ${isOpen ? "" : "-rotate-90"}`}
                  />
                </button>
              </h2>
            )}
            {section.title && !collapsed && !collapsible && (
              <h2 className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-600 font-semibold mt-4 mb-1 px-2.5">
                {section.title}
              </h2>
            )}
            {section.title && collapsed && (
              <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
            )}

            {/* Stays mounted so aria-controls always resolves; `hidden` wins over
                `flex` only because Tailwind v4's reset forces [hidden] to display:none. */}
            <div id={slug ? `sidebar-group-${slug}` : undefined} hidden={!open} className="flex flex-col">
              {items.map((item) => {
                const { Icon } = item;
                return (
                  <NavLink
                    to={item.href}
                    key={item.label}
                    id={item.id}
                    end={item.href === "/dashboard"}
                    title={collapsed ? item.label : undefined}
                    // Pages load on demand: start fetching this one when the pointer or focus
                    // rests on the link for a moment, before the click.
                    onMouseEnter={() => prefetchIntent.start(item.href)}
                    onMouseLeave={() => prefetchIntent.cancel(item.href)}
                    onFocus={() => prefetchIntent.start(item.href)}
                    onBlur={() => prefetchIntent.cancel(item.href)}
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
          </div>
        );
      })}

      {/* Start Tour button (temporarily hidden for students, UI-only) */}
      {role !== "student" && (
      <div className={`mt-auto pt-4 border-t border-slate-200 dark:border-slate-800 ${collapsed ? "flex justify-center" : ""}`}>
        <button
          id="tour-sidebar-start-tour"
          type="button"
          onClick={() => { onNavigate?.(); navigate('/dashboard'); startNextStep(role ?? ''); }}
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
