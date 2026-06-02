import Menu from "@/components/Menu";
import Navbar from "@/components/Navbar";
import { Link } from "react-router-dom";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="h-dvh flex dark:text-gray-100 bg-[#F7F8FA] dark:bg-gray-900">
      {/* LEFT */}
      <div className="w-20 flex-none p-4 bg-white dark:bg-gray-950 overflow-y-auto lg:w-64 xl:w-72">
        <Link
          to="/"
          className="flex items-center justify-center lg:justify-start gap-2"
        >
          <img src="/logo.png" alt="logo" width={32} height={32} />
          <span className="hidden lg:block font-bold">School</span>
        </Link>
        <Menu />
      </div>
      {/* RIGHT */}
      <div className="min-w-0 flex-1 bg-[#F7F8FA] dark:bg-gray-900 overflow-auto flex flex-col">
        <Navbar />
        {children}
      </div>
    </div>
  );
}
