import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import type { ActiveTimeBlock } from '@/hooks/useInstitutionAcademicCalendar';
import { createTimeBlock } from '@/lib/academicCalendarSave';
import {
  ALL_WEEK_DAYS,
  addDuration,
  deriveDuration,
  formatDate,
  toISO,
  validateTimeBlock,
  type DurationUnit,
} from '@/lib/academicCalendarLogic';
import { DateInput, Label, TextInput } from './CalendarFields';

// ─── Quick-create ("New Time Block" quick action, §8/§9) ──────────────────────
//
// The fast, repeatable path for spinning up the next cohort once at least
// one time block already exists — distinct from CustomTimeBlockWizard
// (reserved for first-time setup, with its duration/end-date mode toggle),
// per this session's own confirmed decision. Pre-fills name, duration, and
// session days from referenceBlock (activeTimeBlocks[0] — the confirmed
// default-selection rule's own most-recent block), and defaults the start
// date to the day after that block's own end date (or today, whichever is
// later, so a late-created follow-up cohort doesn't get backdated). Every
// field stays editable — "fast" here means not having to re-derive anything
// from scratch, not that fields are locked.
export function QuickTimeBlockModal({
  referenceBlock,
  institutionId,
  onClose,
  onDone,
}: {
  referenceBlock: ActiveTimeBlock;
  institutionId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const today = toISO(new Date());
  const dayAfterReference = addDuration(referenceBlock.year.endDate, 1, 'days');
  const referenceDuration = deriveDuration(referenceBlock.year.startDate, referenceBlock.year.endDate);

  const [name, setName] = useState(referenceBlock.year.name);
  const [startDate, setStartDate] = useState(dayAfterReference > today ? dayAfterReference : today);
  const [durationCount, setDurationCount] = useState(String(referenceDuration.count));
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(referenceDuration.unit);
  const [schoolWeekDays, setSchoolWeekDays] = useState<number[]>(referenceBlock.year.schoolWeekDays);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedDurationCount = Number(durationCount);
  const effectiveEndDate =
    startDate && parsedDurationCount > 0 ? addDuration(startDate, parsedDurationCount, durationUnit) : '';

  async function confirm() {
    if (!user) return;
    const invalid = validateTimeBlock({
      name,
      startDate,
      checkDuration: true,
      parsedDurationCount,
      effectiveEndDate,
      schoolWeekDays,
    });
    if (invalid) { setError(invalid); return; }

    setSubmitting(true);
    setError(null);
    try {
      await createTimeBlock({ institutionId, uid: user.uid, name, startDate, endDate: effectiveEndDate, schoolWeekDays });
      onDone();
    } catch {
      setError('Failed to save. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">New Time Block</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Pre-filled from {referenceBlock.year.name} — adjust anything before creating.
        </p>

        {error && (
          <div className="mb-3 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Label>
            Name
            <TextInput value={name} onChange={setName} maxLength={100} />
          </Label>
          <Label>
            Start date
            <DateInput value={startDate} onChange={setStartDate} />
          </Label>
          <div className="flex items-end gap-2">
            <Label>
              Duration
              <input
                type="number"
                min={1}
                value={durationCount}
                onChange={(e) => setDurationCount(e.target.value)}
                className="w-20 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </Label>
            <select
              value={durationUnit}
              onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </select>
          </div>
          {effectiveEndDate && (
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">Ends {formatDate(effectiveEndDate)}</p>
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
        </div>

        <div className="mt-5 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:bg-sky-300"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
