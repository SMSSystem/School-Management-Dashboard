import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";

// TODO: Replace these placeholders with real department-level widgets once the
// data layer is connected (see spec §4.3 — Senior teacher dashboard widgets).

const DepartmentOverview = () => (
  <div className="bg-white dark:bg-gray-800 rounded-md p-4">
    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
      Department Overview
    </h2>
    <p className="text-xs text-gray-400 dark:text-gray-500">
      — Teachers, pending grades, attendance gaps (coming soon)
    </p>
  </div>
);

const DepartmentPerformance = () => (
  <div className="bg-white dark:bg-gray-800 rounded-md p-4">
    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
      Department Performance
    </h2>
    <p className="text-xs text-gray-400 dark:text-gray-500">
      — Top / bottom-performing classes within the department (coming soon)
    </p>
  </div>
);

const DepartmentAlerts = () => (
  <div className="bg-white dark:bg-gray-800 rounded-md p-4">
    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
      Department Alerts
    </h2>
    <p className="text-xs text-gray-400 dark:text-gray-500">
      — Chronic absenteeism, overdue results across the department (coming soon)
    </p>
  </div>
);

const SeniorTeacherPage = () => {
  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      {/* DEPARTMENT WIDGETS — senior teacher only */}
      <div className="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-4">
        <DepartmentOverview />
        <DepartmentPerformance />
        <DepartmentAlerts />
      </div>

      {/* MAIN: Schedule */}
      <div className="col-span-12 lg:col-span-8">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md h-full">
          <h1 className="text-xl font-semibold">Schedule</h1>
          <BigCalendar />
        </div>
      </div>

      {/* RIGHT RAIL */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
        <Announcements />
      </div>
    </div>
  );
};

export default SeniorTeacherPage;
