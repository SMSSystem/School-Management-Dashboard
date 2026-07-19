import { useEffect, useRef, useState } from "react";
import { NextStepViewport, useNextStep } from "nextstepjs";
import Menu from "@/components/Menu";
import TopHeader from "@/components/TopHeader";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { BrandApplicator } from "@/components/BrandApplicator";
import { SidebarContext } from "@/lib/SidebarContext";

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
        /* localStorage unavailable (private mode) — collapse state just won't persist */
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
        <TopHeader />
        <div className="flex flex-1 overflow-hidden bg-slate-50 dark:bg-slate-900">
          {/* Sidebar */}
          <aside
            id="tour-sidebar"
            className={[
              "flex-none overflow-y-auto overflow-x-hidden",
              "bg-white dark:bg-slate-950",
              "border-r border-slate-200 dark:border-slate-800",
              "transition-[width] duration-300 ease-in-out",
              collapsed ? "w-14" : "w-60",
            ].join(" ")}
          >
            <Menu collapsed={collapsed} onToggle={toggleSidebar} />
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
