import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { canManage } from '@/lib/roleCapabilities';
import { USE_MOCK } from '@/lib/data';
import { useInstitutionAcademicCalendar, type ActiveTimeBlock } from '@/hooks/useInstitutionAcademicCalendar';
import { createNextYearDraft } from '@/lib/academicCalendarSave';
import { CalendarNotSetUp, Spinner } from './CalendarFields';
import { AcademicYearWizard } from './AcademicYearWizard';
import { CustomTimeBlockWizard } from './CustomTimeBlockWizard';
import { QuickTimeBlockModal } from './QuickTimeBlockModal';
import { EditTimeBlockDaysModal } from './EditTimeBlockDaysModal';
import { CustomTimeBlocksSummaryView } from './CustomTimeBlocksSummaryView';
import { DraftYearConfirmation } from './DraftYearConfirmation';
import { AcademicCalendarManagementView } from './ManagementView';

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AcademicCalendarPage() {
  const { user, role, institutionId, institution } = useAuth();
  // Everything that changes the calendar (the set-up wizards, activating a draft,
  // the automatic next-year draft, edits) is for an admin; a spectator only views.
  const mayEdit = canManage(role);
  const { activeYear, draftYear, allTerms, nonSchoolDays, activeTimeBlocks, loading, timedOut } = useInstitutionAcademicCalendar();
  const isCustomMode = institution?.calendarMode === 'custom';
  // Which draft-related screen to show over the management view (Item 12.2) —
  // 'none' means stay on the management view even though a draft is pending.
  const [draftView, setDraftView] = useState<'none' | 'confirm' | 'edit'>('none');
  // Custom mode only — controls whether QuickTimeBlockModal (§9) is open,
  // for spinning up an additional concurrent time block.
  const [creatingAnotherBlock, setCreatingAnotherBlock] = useState(false);
  // Custom mode only — which existing block's EditTimeBlockDaysModal is
  // open, if any (EDIT_TIME_BLOCK_SCHOOL_WEEK_DAYS_REMEDIATION_PLAN.md).
  const [editingBlock, setEditingBlock] = useState<ActiveTimeBlock | null>(null);

  // Reset back to the management view once the draft itself is gone (activated).
  useEffect(() => {
    if (!draftYear) setDraftView('none');
  }, [draftYear]);

  // Auto-generate next year draft when the active year has ended. Jamaica-
  // year-rollover logic (addOneYear, buildYearName) — never applies to
  // calendarMode === 'custom' institutions, whose time blocks aren't
  // annually-renewing and wouldn't survive being pushed through this
  // (CUSTOM_CALENDAR_MODE_SPEC.md §2). Without this guard, a custom-mode
  // institution's time block would silently get a bogus "+1 Gregorian year"
  // draft the moment its own (much shorter) endDate passed.
  useEffect(() => {
    if (!mayEdit || USE_MOCK || !activeYear || draftYear || !user || !institutionId || institution?.calendarMode === 'custom') return;
    const today = new Date().toISOString().slice(0, 10);
    if (today <= activeYear.endDate) return;

    createNextYearDraft(institutionId, activeYear);
  }, [activeYear, draftYear, user, institutionId, institution, mayEdit]);

  if (USE_MOCK) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Academic Calendar is not available in demo mode.
        </p>
      </div>
    );
  }

  if (timedOut) return <div className="p-6"><p className="text-sm text-red-500 dark:text-red-400">Something went wrong. Please contact your administrator.</p></div>;
  if (loading) return <div className="p-6"><Spinner /></div>;

  // Custom mode has its own, entirely separate routing — activeYear/draftYear
  // stay permanently null here (§3.1), so none of the academic-mode branches
  // below ever apply. No active time block yet: the full first-time wizard
  // (§2, §4). Otherwise the read-only summary, with the quick-create modal
  // (§9) as its "add another" trigger rather than reopening that same wizard.
  if (isCustomMode) {
    if (activeTimeBlocks.length === 0) {
      return mayEdit ? <CustomTimeBlockWizard onDone={() => {}} /> : <CalendarNotSetUp />;
    }
    return (
      <>
        <CustomTimeBlocksSummaryView
          blocks={activeTimeBlocks}
          onCreateAnother={mayEdit ? () => setCreatingAnotherBlock(true) : undefined}
          onEditBlock={mayEdit ? setEditingBlock : undefined}
        />
        {creatingAnotherBlock && (
          <QuickTimeBlockModal
            referenceBlock={activeTimeBlocks[0]}
            institutionId={institutionId!}
            onClose={() => setCreatingAnotherBlock(false)}
            onDone={() => setCreatingAnotherBlock(false)}
          />
        )}
        {editingBlock && (
          <EditTimeBlockDaysModal
            block={editingBlock}
            institutionId={institutionId!}
            onClose={() => setEditingBlock(null)}
            onDone={() => setEditingBlock(null)}
          />
        )}
      </>
    );
  }

  // A read-only role has no wizard or draft screen to see: without an active
  // year there is nothing to show yet.
  if (!mayEdit && !activeYear) return <CalendarNotSetUp />;

  // First-time setup: no active year and no draft.
  if (!activeYear && !draftYear) {
    return <AcademicYearWizard onDone={() => {}} />;
  }

  // The draft edit wizard is identical whether or not an active year exists,
  // so both draftView === 'edit' checks below return this same element
  // instead of duplicating the JSX.
  const editWizard = draftYear
    ? <AcademicYearWizard draftYear={draftYear} onDone={() => setDraftView('confirm')} />
    : null;

  // Draft exists but no active year: show confirmation view (or its edit wizard)
  if (!activeYear && draftYear) {
    if (draftView === 'edit') {
      return editWizard;
    }
    return (
      <DraftYearConfirmation
        draftYear={draftYear}
        previousYearId={null}
        onDone={() => {}}
        onEdit={() => setDraftView('edit')}
      />
    );
  }

  // Active year exists — wait for hook's terms snapshot to deliver
  if (allTerms === null) return <div className="p-6"><Spinner /></div>;

  // Active year exists AND a draft is pending: reachable via the management
  // view's "pending" banner (Item 12.2 — previously a dead end, since the
  // draft-confirmation screen only ever rendered when there was no active year).
  if (draftYear && draftView !== 'none') {
    if (draftView === 'edit') {
      return editWizard;
    }
    return (
      <DraftYearConfirmation
        draftYear={draftYear}
        previousYearId={activeYear!.id}
        onDone={() => setDraftView('none')}
        onEdit={() => setDraftView('edit')}
      />
    );
  }

  return (
    <AcademicCalendarManagementView
      activeYear={activeYear!}
      draftYear={draftYear}
      terms={allTerms}
      nonSchoolDays={nonSchoolDays}
      onViewDraft={() => setDraftView('confirm')}
    />
  );
}
