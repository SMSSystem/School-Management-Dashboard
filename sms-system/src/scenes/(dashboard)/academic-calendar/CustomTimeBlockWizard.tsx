import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { createTimeBlock } from '@/lib/academicCalendarSave';
import { ALL_WEEK_DAYS, addDuration, formatDate, validateTimeBlock, type DurationUnit } from '@/lib/academicCalendarLogic';
import { DateInput, Label, StepCard, TextInput } from './CalendarFields';

// ─── Custom Time Block Wizard (CUSTOM_CALENDAR_MODE_SPEC.md §2, §4) ───────────
//
// Replaces AcademicYearWizard's Step 1–2 (year dates + Jamaica-3-term
// generator) for calendarMode === 'custom' institutions with a single short
// screen. Per §2, a "Time Block" is still, under the hood, exactly one
// AcademicYearDocument with exactly one child TermDocument (termNumber: 1) —
// both sharing the admin's one typed name, since custom-mode admins never
// see "Academic Year" as a separate concept from "Term." Public holidays
// (Jamaica-specific) and custom non-school days are deliberately not asked
// here — they can be added afterward via AcademicCalendarManagementView,
// which already supports it post-activation, so nothing is lost by
// deferring rather than replicating those steps in a shortened form.
//
// Scope note: this wizard is only wired in at the "no active year, no
// draft" first-time-setup entry point (AcademicCalendarPage, below) — a
// trigger for creating an *additional* concurrent time block while one is
// already active is Implementation Order item 9's "New Time Block"
// quick-create, which depends on item 5's hook rework to have anywhere
// sensible to render into.
export function CustomTimeBlockWizard({ onDone }: { onDone: () => void }) {
  const { user, institutionId } = useAuth();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [durationMode, setDurationMode] = useState<'endDate' | 'duration'>('duration');
  const [endDate, setEndDate] = useState('');
  const [durationCount, setDurationCount] = useState('10');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('weeks');
  const [schoolWeekDays, setSchoolWeekDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedDurationCount = Number(durationCount);
  const effectiveEndDate =
    durationMode === 'endDate'
      ? endDate
      : startDate && parsedDurationCount > 0
      ? addDuration(startDate, parsedDurationCount, durationUnit)
      : '';

  async function confirm() {
    if (!user || !institutionId) return;
    const invalid = validateTimeBlock({
      name,
      startDate,
      checkDuration: durationMode === 'duration',
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
    <div className="p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">New Time Block</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        A time block is one independently-scheduled programme — e.g. a 10-week evening course.
        You can add public holidays or other non-school days later from the management view.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300 max-w-2xl">
          {error}
        </div>
      )}

      <StepCard title="Time Block Details">
        <div className="flex flex-col gap-4">
          <Label>
            Name
            <TextInput
              id="tour-academic-calendar-timeblock-name"
              value={name}
              onChange={setName}
              placeholder="e.g. Mechanical Workshop 1 — Cohort A"
              maxLength={100}
            />
          </Label>

          <Label>
            Start date
            <DateInput id="tour-academic-calendar-timeblock-start" value={startDate} onChange={setStartDate} />
          </Label>

          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Length</span>
            <div className="mt-2 flex gap-3">
              {(['duration', 'endDate'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDurationMode(mode)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border ${
                    durationMode === mode
                      ? 'bg-sky-500 text-white border-sky-500'
                      : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-700'
                  }`}
                >
                  {mode === 'duration' ? 'By duration' : 'By end date'}
                </button>
              ))}
            </div>

            {durationMode === 'duration' ? (
              <div className="mt-3 flex items-end gap-3">
                <Label>
                  Duration
                  <input
                    id="tour-academic-calendar-timeblock-duration-count"
                    type="number"
                    min={1}
                    value={durationCount}
                    onChange={(e) => setDurationCount(e.target.value)}
                    className="w-24 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                  />
                </Label>
                <select
                  id="tour-academic-calendar-timeblock-duration-unit"
                  value={durationUnit}
                  onChange={(e) => setDurationUnit(e.target.value as DurationUnit)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 mb-px"
                >
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                </select>
                {effectiveEndDate && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 pb-2.5">
                    Ends {formatDate(effectiveEndDate)}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-3">
                <Label>
                  End date
                  <DateInput
                    id="tour-academic-calendar-timeblock-end"
                    value={endDate}
                    onChange={setEndDate}
                    min={startDate}
                  />
                </Label>
              </div>
            )}
          </div>

          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Session days</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Which day(s) of the week this programme runs on.
            </p>
            <div className="flex gap-3 flex-wrap">
              {ALL_WEEK_DAYS.map(({ label, value }) => (
                <button
                  key={value}
                  id={`tour-academic-calendar-timeblock-weekday-${value}`}
                  type="button"
                  onClick={() =>
                    setSchoolWeekDays((prev) =>
                      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort()
                    )
                  }
                  className={`px-4 py-2 rounded-md text-sm font-medium border ${
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

        <button
          id="tour-academic-calendar-timeblock-create"
          type="button"
          onClick={confirm}
          disabled={submitting}
          className="mt-6 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-green-400"
        >
          {submitting ? 'Creating…' : 'Create Time Block'}
        </button>
      </StepCard>
    </div>
  );
}
