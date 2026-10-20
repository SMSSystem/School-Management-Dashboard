import CalendarCard from "@/components/CalendarCard";
import AdminQuickActions from "@/components/AdminQuickActions";
import { PendingAcademicYearCard } from "@/components/attendance/PendingAcademicYearCard";
import PendingInstitutionProfileCard from "@/components/PendingInstitutionProfileCard";
import AwaitingSignInCard from "@/components/AwaitingSignInCard";
import PendingRegistrationsCard from "@/components/PendingRegistrationsCard";
import CardErrorBoundary from "@/components/CardErrorBoundary";
import { ChartsRow, HomeCell, MetricCardsRow, OverdueRegisterAlert } from "@/components/StaffHomeSections";
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
      <OverdueRegisterAlert count={overdueCount} tour />

      {/* TOP: METRIC CARDS */}
      <MetricCardsRow tour />

      {/* MIDDLE: COUNT + ATTENDANCE */}
      <ChartsRow tour />

      {/* QUICK ACTIONS + CALENDAR */}
      <HomeCell className="col-span-12 lg:col-span-8 h-full">
        <AdminQuickActions />
      </HomeCell>
      <HomeCell className="col-span-12 lg:col-span-4 h-full">
        <CalendarCard />
      </HomeCell>

      {/* AWAITING FIRST SIGN-IN + PENDING REGISTRATIONS */}
      <HomeCell className="col-span-12 lg:col-span-6 h-full">
        <AwaitingSignInCard />
      </HomeCell>
      <HomeCell className="col-span-12 lg:col-span-6 h-full">
        <PendingRegistrationsCard />
      </HomeCell>
    </div>
  );
};

export default AdminPage;
