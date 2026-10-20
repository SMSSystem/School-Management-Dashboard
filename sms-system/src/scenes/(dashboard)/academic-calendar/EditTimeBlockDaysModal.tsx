import { useState } from 'react';
import type { ActiveTimeBlock } from '@/hooks/useInstitutionAcademicCalendar';
import { findAttendanceOnRemovedDays, updateSessionDays } from '@/lib/academicCalendarSave';
import { ALL_WEEK_DAYS, computeRemovedDays } from '@/lib/academicCalendarLogic';

// ─── Edit Time Block — session days only ───────────────────────────────────────
//
// EDIT_TIME_BLOCK_SCHOOL_WEEK_DAYS_REMEDIATION_PLAN.md, rollout item 3: the
// final piece — a guard-clean save now actually persists via updateDoc and
// invalidates the shared academicYears cache, instead of showing a "not
// wired up yet" notice (items 1-2 built the shell and the real,
// already-live attendance-conflict guard first, specifically so this
// destructive write path was never live unguarded even momentarily).
// Narrowly scoped to schoolWeekDays only (§2 of that plan) — not a general
// "edit name/dates" affordance.
export function EditTimeBlockDaysModal({
  block,
  institutionId,
  onClose,
  onDone,
}: {
  block: ActiveTimeBlock;
  institutionId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [schoolWeekDays, setSchoolWeekDays] = useState<number[]>(block.year.schoolWeekDays);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (schoolWeekDays.length === 0) { setError('Select at least one session day.'); return; }
    setError(null);

    const removed = computeRemovedDays(block.year.schoolWeekDays, schoolWeekDays);
    if (removed.length > 0) {
      setChecking(true);
      let conflict: { day: number; exampleDate: string } | null;
      try {
        conflict = await findAttendanceOnRemovedDays(institutionId, block.year.id, removed);
      } catch {
        setChecking(false);
        setError('Failed to check existing attendance. Check your connection and try again.');
        return;
      }
      setChecking(false);
      if (conflict) {
        const label = ALL_WEEK_DAYS.find((d) => d.value === conflict.day)?.label ?? String(conflict.day);
        setError(
          `Can't remove ${label} — attendance already exists for that day ` +
          `(e.g. ${conflict.exampleDate}). Only days with no recorded ` +
          `attendance can be removed.`,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      await updateSessionDays(institutionId, block.year.id, schoolWeekDays);
      onDone();
    } catch {
      setError('Failed to save. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Edit Session Days</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{block.year.name}</p>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Session days</span>
          <div className="mt-1.5 flex gap-1.5 flex-wrap">
            {ALL_WEEK_DAYS.map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setSchoolWeekDays((prev) =>
                    prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort()
                  )
                }
                className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                  schoolWeekDays.includes(value)
                    ? 'bg-sky-500 text-white border-sky-500'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={checking || submitting}
            className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={checking || submitting}
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:bg-sky-300"
          >
            {checking ? 'Checking…' : submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
