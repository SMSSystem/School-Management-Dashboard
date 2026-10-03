import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { NextStepViewport, useNextStep } from "nextstepjs";
import Menu from "@/components/Menu";
import TopHeader from "@/components/TopHeader";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { BrandApplicator } from "@/components/BrandApplicator";
import { SidebarContext } from "@/lib/SidebarContext";
import { MOBILE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";

// Watches tour visibility and restores the sidebar to its pre-tour state once a
// tour started via collapseForTour() ends (completed or skipped). Rendered inside
// SidebarContext.Provider so it's a no-op unless collapseForTour() was actually used.
function TourSidebarRestorer({ onTourEnd }: { onTourEnd: () => void }) {
  const { isNextStepVisible } = useNextStep();
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    if (wasVisibleRef.current && !isNextStepVisible) {
      onTourEnd();
    }
    wasVisibleRef.current = isNextStepVisible;
  }, [isNextStepVisible, onTourEnd]);

  return null;
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useInactivityLogout();

  // Below md the sidebar is an off-canvas drawer (always shown expanded); from
  // md up it is the persistent, collapsible column it has always been.
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Navigating, resizing up to desktop, or pressing Esc closes the drawer.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, isMobile]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  // Holds the sidebar's collapsed state from just before a tour collapsed it, so
  // it can be restored when the tour ends. null = no tour-triggered collapse pending.
  const preTourCollapsedRef = useRef<boolean | null>(null);

  const toggleSidebar = () => {
    // A manual toggle is an explicit user action — it takes precedence over any
    // pending tour-triggered restore.
    preTourCollapsedRef.current = null;
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", String(next));
      } catch {
        // localStorage may be unavailable (e.g. private browsing) — ignore
      }
      return next;
    });
  };

  const collapseForTour = () => {
    if (preTourCollapsedRef.current === null) {
      preTourCollapsedRef.current = collapsed;
    }
    setCollapsed(true);
  };

  const restoreSidebarAfterTour = () => {
    if (preTourCollapsedRef.current !== null) {
      setCollapsed(preTourCollapsedRef.current);
      preTourCollapsedRef.current = null;
    }
  };

  return (
    <SidebarContext.Provider value={{ collapsed, toggleSidebar, collapseForTour }}>
      <BrandApplicator />
      <div className="h-dvh flex flex-col">
        <TopHeader
          onMenuClick={() => setDrawerOpen((open) => !open)}
          menuOpen={drawerOpen}
          menuButtonRef={menuButtonRef}
        />
        <div className="relative flex flex-1 overflow-hidden bg-slate-50 dark:bg-slate-900">
          {/* Mobile drawer backdrop */}
          {isMobile && drawerOpen && (
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={closeDrawer}
              className="fixed inset-0 top-14 z-40 bg-black/50 md:hidden"
            />
          )}

          {/* Sidebar: off-canvas drawer below md, persistent column from md up */}
          <aside
            id="tour-sidebar"
            // Closed drawer: off-screen, so keep it out of the tab order and
            // the accessibility tree too.
            inert={isMobile && !drawerOpen}
            className={[
              "overflow-y-auto overflow-x-hidden",
              "bg-white dark:bg-slate-950",
              "border-r border-slate-200 dark:border-slate-800",
              // mobile: fixed drawer under the header, slid off-screen when closed
              "fixed inset-y-0 top-14 left-0 z-50 w-72 max-w-[85vw]",
              "transition-transform duration-300 ease-in-out",
              drawerOpen ? "translate-x-0" : "-translate-x-full",
              // md+: back in the flex row at its normal width
              "md:static md:z-auto md:flex-none md:max-w-none md:translate-x-0",
              "md:transition-[width]",
              collapsed ? "md:w-14" : "md:w-60",
            ].join(" ")}
          >
            <Menu
              collapsed={collapsed && !isMobile}
              onToggle={toggleSidebar}
              mobile={isMobile}
              onNavigate={closeDrawer}
            />
          </aside>

          {/* Main content */}
          <main className="min-w-0 flex-1 overflow-auto text-slate-900 dark:text-slate-100">
            <NextStepViewport id="main-viewport">
              {children}
            </NextStepViewport>
          </main>
        </div>
      </div>
      <TourSidebarRestorer onTourEnd={restoreSidebarAfterTour} />
    </SidebarContext.Provider>
  );
}
