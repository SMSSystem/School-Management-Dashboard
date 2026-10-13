import { Link } from "react-router-dom";
import { useAwaitingSignInCounts } from "@/hooks/useDashboardCounts";
import { DATA_MODE, USE_MOCK } from "@/lib/data";

// People who have not signed in yet and chosen their own password. Three count()
// aggregations' worth of reads (lib/dashboardCounts.ts), cached for five minutes; the
// users list is not loaded. Each row links to that people list, where the Sign-in
// column shows who has been sent a link.
const rows: { key: "students" | "teachers" | "spectators"; label: string; href: string }[] = [
  { key: "students", label: "Students", href: "/dashboard/list/students" },
  { key: "teachers", label: "Teachers", href: "/dashboard/list/teachers" },
  { key: "spectators", label: "Spectators", href: "/dashboard/list/spectators" },
];

// A spectator cannot open the Spectators list (admin only), so its card leaves that row out.
const AwaitingSignInCard = ({ includeSpectators = true }: { includeSpectators?: boolean }) => {
  const { data, isError } = useAwaitingSignInCounts();
  const show = (n: number | undefined) =>
    USE_MOCK ? "0" : DATA_MODE !== "live" ? "0" : isError ? "—" : n === undefined ? "…" : n.toLocaleString();

  return (
    <div id="tour-home-awaiting-sign-in" className="bg-white dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-3 h-full">
      <div>
        <h2 className="text-lg font-semibold">Awaiting first sign-in</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">People who have not yet signed in and chosen their own password.</p>
      </div>
      <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-700">
        {rows.filter((r) => includeSpectators || r.key !== "spectators").map((r) => (
          <li key={r.key}>
            <Link to={r.href} className="flex items-center justify-between py-2 text-sm hover:underline">
              <span>{r.label}</span>
              <span className="font-semibold text-gray-800 dark:text-gray-100">{show(data?.[r.key])}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AwaitingSignInCard;
