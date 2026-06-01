import { useState, useEffect } from "react";
import { getCountFromServer, collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DATA_MODE } from "@/lib/data";
import GrowthChart from "@/components/superadmin/GrowthChart";
import InstitutionsTable from "@/components/superadmin/InstitutionsTable";
import RecentSignups from "@/components/superadmin/RecentSignups";
import AlertsFeed from "@/components/superadmin/AlertsFeed";
import { Link } from "react-router-dom";

type KpiLive = {
  institutions: number | null;
  users: number | null;
  activeInstitutions: number | null;
  superAdmins: number | null;
};

const kpiMeta = [
  {
    label: "Total Institutions",
    mockValue: "36",
    mockSub: "+3 this month",
    bg: "bg-lamaSky dark:bg-sky-900/40",
    badge: "Platform",
  },
  {
    label: "Total Users",
    mockValue: "1,280",
    mockSub: "+89 this month",
    bg: "bg-lamaYellow dark:bg-amber-900/40",
    badge: "All roles",
  },
  {
    label: "Active (30d)",
    mockValue: "31",
    mockSub: "86% of institutions",
    bg: "bg-lamaPurple dark:bg-purple-900/40",
    badge: "Institutions",
  },
  {
    label: "Super Admins",
    mockValue: "4",
    mockSub: "Platform-wide",
    bg: "bg-lamaSky dark:bg-sky-900/40",
    badge: "Roster",
  },
];

const quickActions = [
  {
    label: "Onboard Institution",
    icon: "/create.png",
    href: "/onboard-institution",
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
  const [kpiLive, setKpiLive] = useState<KpiLive>({
    institutions: null,
    users: null,
    activeInstitutions: null,
    superAdmins: null,
  });
  const [kpiError, setKpiError] = useState(false);

  useEffect(() => {
    if (DATA_MODE !== "live") return;
    async function fetchCounts() {
      try {
        const [instSnap, usersSnap, activeSnap, saSnap] = await Promise.all([
          getCountFromServer(collection(db, "institutions")),
          getCountFromServer(collection(db, "users")),
          getCountFromServer(
            query(collection(db, "institutions"), where("status", "==", "active"))
          ),
          getCountFromServer(
            query(collection(db, "users"), where("role", "==", "super_admin"))
          ),
        ]);
        setKpiLive({
          institutions: instSnap.data().count,
          users: usersSnap.data().count,
          activeInstitutions: activeSnap.data().count,
          superAdmins: saSnap.data().count,
        });
      } catch {
        setKpiError(true);
      }
    }
    fetchCounts();
  }, []);

  // Ordered to match kpiMeta indices
  const liveValues: (number | null)[] = [
    kpiLive.institutions,
    kpiLive.users,
    kpiLive.activeInstitutions,
    kpiLive.superAdmins,
  ];

  return (
    <div className="p-4 grid grid-cols-12 gap-4">

      {/* KPI STRIP */}
      <div className="col-span-12 grid grid-cols-12 gap-4">
        {kpiMeta.map((meta, i) => {
          let value: string;
          let sub: string;
          if (DATA_MODE === "mock") {
            value = meta.mockValue;
            sub = meta.mockSub;
          } else if (DATA_MODE === "live") {
            value = kpiError ? "err" : liveValues[i] === null ? "…" : liveValues[i]!.toLocaleString();
            sub = "";
          } else {
            value = "—";
            sub = "";
          }
          return (
            <div
              key={meta.label}
              className={`col-span-12 sm:col-span-6 xl:col-span-3 ${meta.bg} rounded-2xl p-4 flex flex-col gap-1`}
            >
              <div className="flex justify-between items-center">
                <span className="text-xs bg-white/60 dark:bg-white/10 px-2 py-0.5 rounded-full text-gray-700 dark:text-gray-200 font-medium">
                  {meta.badge}
                </span>
                <img src="/more.png" alt="" aria-hidden="true" width={18} height={18} className="opacity-50" />
              </div>
              <p className="text-3xl font-bold text-gray-800 dark:text-white mt-2">{value}</p>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{meta.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>
            </div>
          );
        })}
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

      {/* INSTITUTIONS TABLE (full width) */}
      <div className="col-span-12 h-[clamp(24rem,52vh,40rem)]">
        <InstitutionsTable />
      </div>

      {/* GROWTH CHART (full width) */}
      <div className="col-span-12 h-[clamp(22rem,46vh,36rem)]">
        <GrowthChart />
      </div>

      {/* RECENT SIGN-UPS + ALERTS FEED (side by side) */}
      <div className="col-span-12 grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6 h-[clamp(22rem,46vh,36rem)]">
          <RecentSignups />
        </div>
        <div className="col-span-12 lg:col-span-6 h-[clamp(22rem,46vh,36rem)]">
          <AlertsFeed />
        </div>
      </div>

    </div>
  );
};

export default SuperAdminPage;
