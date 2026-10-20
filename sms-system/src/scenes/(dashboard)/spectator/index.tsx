import CalendarCard from "@/components/CalendarCard";
import SpectatorQuickLinks from "@/components/SpectatorQuickLinks";
import AwaitingSignInCard from "@/components/AwaitingSignInCard";
import PendingRegistrationsCard from "@/components/PendingRegistrationsCard";
import { ChartsRow, HomeCell, MetricCardsRow, OverdueRegisterAlert } from "@/components/StaffHomeSections";
import { useInstitutionAcademicCalendar } from "@/hooks/useInstitutionAcademicCalendar";
import { useOverdueRegisterCount } from "@/hooks/useOverdueRegisterCount";
import { useAuth } from "@/lib/AuthContext";

// The spectator's home: the admin dashboard (scenes/(dashboard)/admin) without
// anything that leads to editing, per docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md.
// Left out on purpose: the "complete your institution profile" and "set up the
// academic year" prompts and the Add Teacher / Add Student shortcuts (replaced
// by read-only quick links). Like the admin home it no longer shows the Events,
// Announcements and Institution Profile cards (they stay in the sidebar). The
// metric cards, charts, calendar and the two count cards are the admin's own
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
      <OverdueRegisterAlert count={overdueCount} />

      {/* TOP: METRIC CARDS */}
      <MetricCardsRow />

      {/* MIDDLE: COUNT + ATTENDANCE */}
      <ChartsRow />

      {/* QUICK LINKS + CALENDAR */}
      <HomeCell className="col-span-12 lg:col-span-8 h-full">
        <SpectatorQuickLinks />
      </HomeCell>
      <HomeCell className="col-span-12 lg:col-span-4 h-full">
        <CalendarCard />
      </HomeCell>

      {/* AWAITING FIRST SIGN-IN + PENDING REGISTRATIONS (view only) */}
      <HomeCell className="col-span-12 lg:col-span-6 h-full">
        <AwaitingSignInCard includeSpectators={false} />
      </HomeCell>
      <HomeCell className="col-span-12 lg:col-span-6 h-full">
        <PendingRegistrationsCard />
      </HomeCell>
    </div>
  );
};

export default SpectatorPage;
