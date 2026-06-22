import { useState } from "react";
import Menu from "@/components/Menu";
import TopHeader from "@/components/TopHeader";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { BrandApplicator } from "@/components/BrandApplicator";

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

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", String(next));
      } catch {}
      return next;
    });
  };

  return (
    <>
      <BrandApplicator />
      <div className="h-dvh flex flex-col">
        <TopHeader />
        <div className="flex flex-1 overflow-hidden bg-slate-50 dark:bg-slate-900">
          {/* Sidebar */}
          <aside
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
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
