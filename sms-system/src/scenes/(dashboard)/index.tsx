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
      <div className="h-dvh flex flex-col dark:text-gray-100">
        <TopHeader />
        <div className="flex flex-1 overflow-hidden bg-[#F7F8FA] dark:bg-gray-900">
          {/* LEFT sidebar */}
          <div
            className={[
              "flex-none py-3 overflow-y-auto overflow-x-hidden",
              "border-r border-white/20",
              "transition-[width] duration-300 ease-in-out",
              collapsed ? "w-14" : "w-60",
            ].join(" ")}
            style={{ backgroundColor: "var(--brand-button-bg, #7B1A1A)" }}
          >
            <Menu collapsed={collapsed} onToggle={toggleSidebar} />
          </div>
          {/* RIGHT content */}
          <div className="min-w-0 flex-1 overflow-auto">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
