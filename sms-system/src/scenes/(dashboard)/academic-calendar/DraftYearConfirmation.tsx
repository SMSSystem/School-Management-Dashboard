import { useState } from 'react';
import type { AcademicYearDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { activateDraftYear } from '@/lib/academicCalendarSave';
import { ALL_WEEK_DAYS, formatDate } from '@/lib/academicCalendarLogic';

// ─── Draft Year Confirmation ───────────────────────────────────────────────────

export function DraftYearConfirmation({
  draftYear,
  previousYearId,
  onDone,
  onEdit,
}: {
  draftYear: AcademicYearDocument & { id: string };
  previousYearId: string | null;
  onDone: () => void;
  onEdit: () => void;
}) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      await activateDraftYear({ draftYear, previousYearId, uid: user.uid });
      onDone();
    } catch {
      setError('Failed to activate. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-xl">
        <div className="mb-6 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4">
          <h2 className="text-base font-semibold text-amber-800 dark:text-amber-300">
            Academic Year {draftYear.name} — Pending Confirmation
          </h2>
          <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
            A new academic year has been auto-generated based on the previous year. Review the details
            carefully — especially the public holidays, as Easter shifts each year.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3 text-sm">
          <div>
            <p className="font-medium text-gray-700 dark:text-gray-200">Date range</p>
            <p className="text-gray-500 dark:text-gray-400">{formatDate(draftYear.startDate)} → {formatDate(draftYear.endDate)}</p>
          </div>
          <div>
            <p className="font-medium text-gray-700 dark:text-gray-200">School week</p>
            <p className="text-gray-500 dark:text-gray-400">
              {ALL_WEEK_DAYS.filter((d) => draftYear.schoolWeekDays.includes(d.value)).map((d) => d.label).join(', ')}
            </p>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Term dates and non-school days can be edited now via "Edit details first," or later on the
            management view once this year is active.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            id="tour-academic-calendar-draft-edit"
            type="button"
            onClick={onEdit}
            className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Edit details first
          </button>
          <button
            id="tour-academic-calendar-draft-confirm"
            type="button"
            onClick={confirm}
            disabled={submitting}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-green-400"
          >
            {submitting ? 'Activating…' : 'Confirm and Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}
