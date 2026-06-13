import Menu from "@/components/Menu";
import Navbar from "@/components/Navbar";
import { Link } from "react-router-dom";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { BrandApplicator } from "@/components/BrandApplicator";
import { useAuth } from "@/lib/AuthContext";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useInactivityLogout();
  const { role, institution } = useAuth();

  const showInstitutionHeader = role !== 'super_admin' && institution !== null;

  return (
    <>
      <BrandApplicator />
      <div className="h-dvh flex dark:text-gray-100 bg-[#F7F8FA] dark:bg-gray-900">
        {/* LEFT */}
        <div className="w-20 flex-none p-4 bg-white dark:bg-gray-950 overflow-y-auto lg:w-64 xl:w-72">
          {showInstitutionHeader ? (
            <Link
              to="/"
              className="flex items-center justify-center lg:justify-start gap-2 mb-2 pb-3 border-b border-gray-200 dark:border-gray-700"
            >
              {institution.logoUrl ? (
                <img
                  src={institution.logoUrl}
                  alt={institution.name}
                  className="w-10 h-10 object-contain rounded shrink-0"
                />
              ) : (
                <img src="/logo.png" alt="logo" width={32} height={32} />
              )}
              <span className="hidden lg:block text-sm font-semibold text-gray-800 dark:text-white truncate">
                {institution.name}
              </span>
            </Link>
          ) : (
            <Link
              to="/"
              className="flex items-center justify-center lg:justify-start gap-2"
            >
              <img src="/logo.png" alt="logo" width={32} height={32} />
              <span className="hidden lg:block font-bold">School</span>
            </Link>
          )}
          <Menu />
        </div>
        {/* RIGHT */}
        <div className="min-w-0 flex-1 bg-[#F7F8FA] dark:bg-gray-900 overflow-auto flex flex-col">
          <Navbar />
          {children}
        </div>
      </div>
    </>
  );
}
