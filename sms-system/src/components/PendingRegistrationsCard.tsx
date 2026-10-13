import { Link } from "react-router-dom";
import { usePendingRegistrationsCount } from "@/hooks/useDashboardCounts";
import { DATA_MODE, USE_MOCK } from "@/lib/data";

// Enrolment registrations nobody has reviewed yet: one count() aggregation
// (lib/dashboardCounts.ts), cached for five minutes. Links to the Registrations page.
const PendingRegistrationsCard = () => {
  const { data, isError } = usePendingRegistrationsCount();
  const text = USE_MOCK || DATA_MODE !== "live" ? "0" : isError ? "—" : data === undefined ? "…" : data.toLocaleString();

  return (
    <div id="tour-home-pending-registrations" className="bg-white dark:bg-gray-800 rounded-xl p-4 flex flex-col gap-3 h-full">
      <div>
        <h2 className="text-lg font-semibold">Pending registrations</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">Enrolment forms waiting to be reviewed.</p>
      </div>
      <p className="text-3xl font-semibold text-gray-800 dark:text-gray-100">{text}</p>
      <Link to="/dashboard/registrations" className="text-sm text-sky-700 dark:text-sky-300 underline mt-auto">
        Open registrations →
      </Link>
    </div>
  );
};

export default PendingRegistrationsCard;
