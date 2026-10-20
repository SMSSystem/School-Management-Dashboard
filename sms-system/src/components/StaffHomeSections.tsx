import type { ReactNode } from "react";
import AttendanceChart from "@/components/AttendanceChart";
import CountChart from "@/components/CountChart";
import UserCard from "@/components/UserCard";
import CardErrorBoundary from "@/components/CardErrorBoundary";

// The parts of the administrator's Home (scenes/(dashboard)/admin) that the spectator's Home (scenes/(dashboard)/spectator)
// repeats: the overdue-register alert, the four head-count cards and the two charts. The spectator page leaves out the
// administrator's prompts and shortcuts and has no product tour, so the tour ids (`tour`) are the administrator's alone.

/** One card cell of the Home grid, behind an error boundary so a failing card does not take the page down. */
export function HomeCell({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={className}>
      <CardErrorBoundary>{children}</CardErrorBoundary>
    </div>
  );
}

/** "3 register slots overdue today", or nothing when none are. */
export function OverdueRegisterAlert({ count, tour }: { count: number; tour?: boolean }) {
  if (count <= 0) return null;
  return (
    <div className="col-span-12">
      <div
        id={tour ? "tour-home-overdue-alert" : undefined}
        className="rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 px-4 py-2.5 text-sm text-orange-800 dark:text-orange-300"
      >
        <span className="font-medium">
          {count} register slot{count !== 1 ? "s" : ""}
        </span>{" "}
        overdue today.{" "}
        <a id={tour ? "tour-home-overdue-alert-link" : undefined} href="/dashboard/attendance/general" className="underline">
          View register →
        </a>
      </div>
    </div>
  );
}

/** The student, teacher, parent and class head-count cards. */
export function MetricCardsRow({ tour }: { tour?: boolean }) {
  const cell = "col-span-12 sm:col-span-6 xl:col-span-3";
  return (
    <div id={tour ? "tour-home-user-card-row" : undefined} className="col-span-12 grid grid-cols-12 gap-4">
      <HomeCell className={cell}>
        <UserCard type="student" />
      </HomeCell>
      <HomeCell className={cell}>
        <UserCard type="teacher" />
      </HomeCell>
      <HomeCell className={cell}>
        <UserCard type="parent" />
      </HomeCell>
      <HomeCell className={cell}>
        <UserCard type="class" />
      </HomeCell>
    </div>
  );
}

/** The student/teacher count chart beside the attendance chart. */
export function ChartsRow({ tour }: { tour?: boolean }) {
  return (
    <div className="col-span-12 grid grid-cols-12 gap-4">
      <HomeCell className="col-span-12 lg:col-span-4 h-[clamp(22rem,45vh,32rem)]">
        <CountChart />
      </HomeCell>
      <div
        id={tour ? "tour-home-attendance-chart" : undefined}
        className="col-span-12 lg:col-span-8 h-[clamp(22rem,45vh,32rem)]"
      >
        <CardErrorBoundary>
          <AttendanceChart />
        </CardErrorBoundary>
      </div>
    </div>
  );
}
