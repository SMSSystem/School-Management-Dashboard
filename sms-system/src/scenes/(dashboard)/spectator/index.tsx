import Announcements from "@/components/Announcements";
import AttendanceChart from "@/components/AttendanceChart";
import CountChart from "@/components/CountChart";
import CalendarCard from "@/components/CalendarCard";
import EventsList from "@/components/EventsList";
import SpectatorQuickLinks from "@/components/SpectatorQuickLinks";
import UserCard from "@/components/UserCard";
import { InstitutionBrandCard } from "@/components/InstitutionBrandCard";
import { useInstitutionAcademicCalendar } from "@/hooks/useInstitutionAcademicCalendar";
import { useOverdueRegisterCount } from "@/hooks/useOverdueRegisterCount";
import { useAuth } from "@/lib/AuthContext";

// The spectator's home: the admin dashboard (scenes/(dashboard)/admin) without
// anything that leads to editing, per docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md.
// Left out on purpose: the "complete your institution profile" and "set up the
// academic year" prompts, the Add Teacher / Add Student shortcuts (replaced by
// read-only quick links), and the edit links on the institution card. The
// metric cards, charts, calendar, events and announcements are the admin's own
// components and cost the same reads.
const SpectatorPage = () => {
  const { institutionId } = useAuth();
  const { activeTerm } = useInstitutionAcademicCalendar();
  const overdueCount = useOverdueRegisterCount(institutionId, activeTerm);

  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      {/* READ-ONLY NOTICE */}
      <div className="col-span-12">
        <div className="rounded-md bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 px-4 py-2.5 text-sm text-sky-800 dark:text-sky-200">
          You have read-only access: you can view information across the institution but cannot change anything.
        </div>
      </div>

      {/* OVERDUE REGISTER ALERT */}
      {overdueCount > 0 && (
        <div className="col-span-12">
          <div className="rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 px-4 py-2.5 text-sm text-orange-800 dark:text-orange-300">
            <span className="font-medium">{overdueCount} register slot{overdueCount !== 1 ? 's' : ''}</span> overdue today.{' '}
            <a href="/dashboard/attendance/general" className="underline">View register →</a>
          </div>
        </div>
      )}

      {/* TOP: METRIC CARDS */}
      <div className="col-span-12 grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <UserCard type="student" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <UserCard type="teacher" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <UserCard type="parent" />
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <UserCard type="class" />
        </div>
      </div>

      {/* MIDDLE: COUNT + ATTENDANCE */}
      <div className="col-span-12 grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4 h-[clamp(22rem,45vh,32rem)]">
          <CountChart />
        </div>
        <div className="col-span-12 lg:col-span-8 h-[clamp(22rem,45vh,32rem)]">
          <AttendanceChart />
        </div>
      </div>

      {/* QUICK LINKS + CALENDAR */}
      <div className="col-span-12 lg:col-span-8 h-full">
        <SpectatorQuickLinks />
      </div>
      <div className="col-span-12 lg:col-span-4 h-full">
        <CalendarCard />
      </div>

      {/* EVENTS */}
      <div className="col-span-12 h-full">
        <EventsList />
      </div>

      {/* INSTITUTION PROFILE (view only) + ANNOUNCEMENTS */}
      <div className="col-span-12 lg:col-span-4 h-full">
        <InstitutionBrandCard readOnly />
      </div>
      <div className="col-span-12 lg:col-span-8 h-full">
        <Announcements />
      </div>
    </div>
  );
};

export default SpectatorPage;
