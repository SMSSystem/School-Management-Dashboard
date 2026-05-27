import GrowthChart from "@/components/superadmin/GrowthChart";
import InstitutionsTable from "@/components/superadmin/InstitutionsTable";
import RecentSignups from "@/components/superadmin/RecentSignups";
import AlertsFeed from "@/components/superadmin/AlertsFeed";
import { Link } from "react-router-dom";

const kpiCards = [
  {
    label: "Total Institutions",
    value: "36",
    sub: "+3 this month",
    bg: "bg-lamaSky dark:bg-sky-900/40",
    badge: "Platform",
  },
  {
    label: "Total Users",
    value: "1,280",
    sub: "+89 this month",
    bg: "bg-lamaYellow dark:bg-amber-900/40",
    badge: "All roles",
  },
  {
    label: "Active (30d)",
    value: "31",
    sub: "86% of institutions",
    bg: "bg-lamaPurple dark:bg-purple-900/40",
    badge: "Institutions",
  },
  {
    label: "Super Admins",
    value: "4",
    sub: "Platform-wide",
    bg: "bg-lamaSky dark:bg-sky-900/40",
    badge: "Roster",
  },
];

const quickActions = [
  {
    label: "Onboard Institution",
    icon: "/create.png",
    href: "/create-user",
    colorClasses:
      "text-sky-700 bg-lamaSkyLight dark:bg-sky-900/20 dark:text-sky-300 border border-lamaSky dark:border-sky-800",
  },
  {
    label: "Send Announcement",
    icon: "/announcement.png",
    href: "/list/announcements",
    colorClasses:
      "text-yellow-700 bg-lamaYellowLight dark:bg-yellow-900/20 dark:text-yellow-300 border border-lamaYellow dark:border-yellow-800",
  },
  {
    label: "Manage Admins",
    icon: "/setting.png",
    href: "/settings",
    colorClasses:
      "text-purple-700 bg-lamaPurpleLight dark:bg-purple-900/20 dark:text-purple-300 border border-lamaPurple dark:border-purple-800",
  },
];

const SuperAdminPage = () => {
  return (
    <div className="p-4 grid grid-cols-12 gap-4">

      {/* KPI STRIP */}
      <div className="col-span-12 grid grid-cols-12 gap-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={`col-span-12 sm:col-span-6 xl:col-span-3 ${card.bg} rounded-2xl p-4 flex flex-col gap-1`}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs bg-white/60 dark:bg-white/10 px-2 py-0.5 rounded-full text-gray-700 dark:text-gray-200 font-medium">
                {card.badge}
              </span>
              <img src="/more.png" alt="" aria-hidden="true" width={18} height={18} className="opacity-50" />
            </div>
            <p className="text-3xl font-bold text-gray-800 dark:text-white mt-2">{card.value}</p>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{card.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* QUICK ACTIONS */}
      <div className="col-span-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickActions.map((action) => (
          <Link
            key={action.label}
            to={action.href}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] hover:shadow-sm ${action.colorClasses}`}
          >
            <img
              src={action.icon}
              alt=""
              width={18}
              height={18}
              className="dark:invert shrink-0"
            />
            <span>{action.label}</span>
          </Link>
        ))}
      </div>

      {/* INSTITUTIONS TABLE + RECENT SIGN-UPS */}
      <div className="col-span-12 grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 h-[clamp(24rem,52vh,40rem)]">
          <InstitutionsTable />
        </div>
        <div className="col-span-12 lg:col-span-4 h-[clamp(24rem,52vh,40rem)]">
          <RecentSignups />
        </div>
      </div>

      {/* GROWTH CHART + ALERTS FEED */}
      <div className="col-span-12 grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-8 h-[clamp(22rem,46vh,36rem)]">
          <GrowthChart />
        </div>
        <div className="col-span-12 lg:col-span-4 h-[clamp(22rem,46vh,36rem)]">
          <AlertsFeed />
        </div>
      </div>

    </div>
  );
};

export default SuperAdminPage;
