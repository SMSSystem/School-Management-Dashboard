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

  return (
    <>
      <BrandApplicator />
      <div className="h-dvh flex flex-col dark:text-gray-100">
        <TopHeader />
        <div className="flex flex-1 overflow-hidden bg-[#F7F8FA] dark:bg-gray-900">
          {/* LEFT sidebar */}
          <div className="w-20 flex-none p-4 bg-white dark:bg-gray-950 overflow-y-auto lg:w-64 xl:w-72">
            <Menu />
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
