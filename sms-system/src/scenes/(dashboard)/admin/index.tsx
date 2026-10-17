import AttendanceChart from "@/components/AttendanceChart";
import CountChart from "@/components/CountChart";
import CalendarCard from "@/components/CalendarCard";
import AdminQuickActions from "@/components/AdminQuickActions";
import UserCard from "@/components/UserCard";
import { PendingAcademicYearCard } from "@/components/attendance/PendingAcademicYearCard";
import PendingInstitutionProfileCard from "@/components/PendingInstitutionProfileCard";
import AwaitingSignInCard from "@/components/AwaitingSignInCard";
import PendingRegistrationsCard from "@/components/PendingRegistrationsCard";
import CardErrorBoundary from "@/components/CardErrorBoundary";
import { useInstitutionAcademicCalendar } from "@/hooks/useInstitutionAcademicCalendar";
import { useOverdueRegisterCount } from "@/hooks/useOverdueRegisterCount";
import { useAuth } from "@/lib/AuthContext";

const AdminPage = () => {
  const { institutionId } = useAuth();
  const { draftYear, activeTerm } = useInstitutionAcademicCalendar();
  const overdueCount = useOverdueRegisterCount(institutionId, activeTerm);

  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      {/* PENDING INSTITUTION PROFILE CARD */}
      <div className="col-span-12">
        <CardErrorBoundary>
          <PendingInstitutionProfileCard />
        </CardErrorBoundary>
      </div>

      {/* PENDING ACADEMIC YEAR CARD */}
      {draftYear && (
        <div className="col-span-12">
          <CardErrorBoundary>
            <PendingAcademicYearCard draftYearName={draftYear.name} />
          </CardErrorBoundary>
        </div>
      )}

      {/* OVERDUE REGISTER ALERT */}
      {overdueCount > 0 && (
        <div className="col-span-12">
          <div id="tour-home-overdue-alert" className="rounded-md bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 px-4 py-2.5 text-sm text-orange-800 dark:text-orange-300">
            <span className="font-medium">{overdueCount} register slot{overdueCount !== 1 ? 's' : ''}</span> overdue today.{' '}
            <a id="tour-home-overdue-alert-link" href="/dashboard/attendance/general" className="underline">View register →</a>
          </div>
        </div>
      )}

      {/* TOP: METRIC CARDS */}
      <div id="tour-home-user-card-row" className="col-span-12 grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <CardErrorBoundary>
            <UserCard type="student" />
          </CardErrorBoundary>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <CardErrorBoundary>
            <UserCard type="teacher" />
          </CardErrorBoundary>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <CardErrorBoundary>
            <UserCard type="parent" />
          </CardErrorBoundary>
        </div>
        <div className="col-span-12 sm:col-span-6 xl:col-span-3">
          <CardErrorBoundary>
            <UserCard type="class" />
          </CardErrorBoundary>
        </div>
      </div>

      {/* MIDDLE: COUNT + ATTENDANCE */}
      <div className="col-span-12 grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4 h-[clamp(22rem,45vh,32rem)]">
          <CardErrorBoundary>
            <CountChart />
          </CardErrorBoundary>
        </div>
        <div id="tour-home-attendance-chart" className="col-span-12 lg:col-span-8 h-[clamp(22rem,45vh,32rem)]">
          <CardErrorBoundary>
            <AttendanceChart />
          </CardErrorBoundary>
        </div>
      </div>

      {/* QUICK ACTIONS + CALENDAR */}
      <div className="col-span-12 lg:col-span-8 h-full">
        <CardErrorBoundary>
          <AdminQuickActions />
        </CardErrorBoundary>
      </div>
      <div className="col-span-12 lg:col-span-4 h-full">
        <CardErrorBoundary>
          <CalendarCard />
        </CardErrorBoundary>
      </div>

      {/* AWAITING FIRST SIGN-IN + PENDING REGISTRATIONS */}
      <div className="col-span-12 lg:col-span-6 h-full">
        <CardErrorBoundary>
          <AwaitingSignInCard />
        </CardErrorBoundary>
      </div>
      <div className="col-span-12 lg:col-span-6 h-full">
        <CardErrorBoundary>
          <PendingRegistrationsCard />
        </CardErrorBoundary>
      </div>
    </div>
  );
};

export default AdminPage;
