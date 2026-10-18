import type { Dispatch, SetStateAction } from 'react';
import { Pencil } from 'lucide-react';
import type { AcademicYearDocument } from '@/lib/firebase';
import { ALL_WEEK_DAYS, buildYearName, type CustomNSD, type WizardHoliday, type WizardTerm } from '@/lib/academicCalendarLogic';
import { DateInput, Label, StepCard, TextInput } from './CalendarFields';

// The six steps of the set-up wizard (AcademicYearWizard.tsx). The wizard keeps every value and handler; each
// step is the markup of one screen.

export function YearDatesStep({
  yearStart,
  setYearStart,
  yearEnd,
  setYearEnd,
  goToStep2,
}: {
  yearStart: string;
  setYearStart: (value: string) => void;
  yearEnd: string;
  setYearEnd: (value: string) => void;
  goToStep2: () => void;
}) {
  return (
    <StepCard title="Step 1 — Academic Year Dates">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Label>
          Start date
          <DateInput id="tour-academic-calendar-year-start" value={yearStart} onChange={setYearStart} />
        </Label>
        <Label>
          End date
          <DateInput id="tour-academic-calendar-year-end" value={yearEnd} onChange={(v) => setYearEnd(v)} min={yearStart} />
        </Label>
      </div>
      <button id="tour-academic-calendar-wizard-next" type="button" onClick={goToStep2} className="mt-6 rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
        Next →
      </button>
    </StepCard>
  );
}

export function TermsStep({
  terms,
  updateTerm,
  setStep,
  goToStep3,
}: {
  terms: WizardTerm[];
  updateTerm: (number: 1 | 2 | 3, changes: Partial<WizardTerm>) => void;
  setStep: (step: number) => void;
  goToStep3: () => void;
}) {
  return (
    <StepCard title="Step 2 — Term Names and Dates">
      <div className="flex flex-col gap-6">
        {terms.map((t) => (
          <div key={t.number} className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Term {t.number}</span>
              {t.name !== t.defaultName && (
                <button
                  id={`tour-academic-calendar-term-${t.number}-reset`}
                  type="button"
                  onClick={() => updateTerm(t.number, { name: t.defaultName })}
                  className="text-xs text-sky-600 hover:underline"
                >
                  Reset to default
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Label>
                Name
                <TextInput id={`tour-academic-calendar-term-${t.number}-name`} value={t.name} onChange={(v) => updateTerm(t.number, { name: v })} maxLength={80} />
              </Label>
              <Label>
                Start date
                <DateInput id={`tour-academic-calendar-term-${t.number}-start`} value={t.startDate} onChange={(v) => updateTerm(t.number, { startDate: v })} />
              </Label>
              <Label>
                End date
                <DateInput id={`tour-academic-calendar-term-${t.number}-end`} value={t.endDate} onChange={(v) => updateTerm(t.number, { endDate: v })} min={t.startDate} />
              </Label>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex gap-3">
        <button id="tour-academic-calendar-wizard-back" type="button" onClick={() => setStep(1)} className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
          ← Back
        </button>
        <button id="tour-academic-calendar-wizard-next" type="button" onClick={goToStep3} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
          Next →
        </button>
      </div>
    </StepCard>
  );
}

export function SchoolWeekStep({
  schoolWeekDays,
  setSchoolWeekDays,
  setStep,
  goToStep4,
}: {
  schoolWeekDays: number[];
  setSchoolWeekDays: Dispatch<SetStateAction<number[]>>;
  setStep: (step: number) => void;
  goToStep4: () => void;
}) {
  return (
    <StepCard title="Step 3 — School Week">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Select the days of the week that are instructional (at least one required).
      </p>
      <div className="flex gap-3 flex-wrap">
        {ALL_WEEK_DAYS.map(({ label, value }) => (
          <button
            key={value}
            id={`tour-academic-calendar-weekday-${value}`}
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
      <div className="mt-6 flex gap-3">
        <button id="tour-academic-calendar-wizard-back" type="button" onClick={() => setStep(2)} className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
          ← Back
        </button>
        <button id="tour-academic-calendar-wizard-next" type="button" onClick={goToStep4} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
          Next →
        </button>
      </div>
    </StepCard>
  );
}

export function HolidaysStep({
  holidays,
  toggleHoliday,
  editingHolidayId,
  setEditingHolidayId,
  editHolidayDate,
  yearStart,
  yearEnd,
  setStep,
  goToStep5,
}: {
  holidays: WizardHoliday[];
  toggleHoliday: (id: number) => void;
  editingHolidayId: number | null;
  setEditingHolidayId: (id: number | null) => void;
  editHolidayDate: (id: number, isoDate: string) => void;
  yearStart: string;
  yearEnd: string;
  setStep: (step: number) => void;
  goToStep5: () => void;
}) {
  return (
    <StepCard title="Step 4 — Public Holidays">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
        Check each holiday that your institution observes. You must interact with every item before proceeding.
      </p>
      <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
        Unchecked holidays will still be school days. Check only the ones your institution observes.
      </p>
      <div className="flex flex-col gap-2">
        {holidays.map((h) => (
          <div
            key={h.id}
            className={`flex items-center gap-3 rounded-md border p-3 ${
              h.interacted
                ? 'border-gray-200 dark:border-gray-700'
                : 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10'
            }`}
          >
            <input
              id={`tour-academic-calendar-holiday-${h.id}`}
              type="checkbox"
              checked={h.confirmed}
              onChange={() => toggleHoliday(h.id)}
              className="h-4 w-4 rounded border-gray-300 text-sky-500 cursor-pointer"
            />
            <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{h.name}</span>
            {editingHolidayId === h.id ? (
              <>
                <DateInput
                  value={h.isoDate}
                  onChange={(v) => editHolidayDate(h.id, v)}
                  min={yearStart}
                  max={yearEnd}
                />
                <button
                  type="button"
                  onClick={() => setEditingHolidayId(null)}
                  className="text-xs text-sky-600 hover:underline"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  {new Date(h.isoDate + 'T12:00:00Z').toLocaleDateString('en-JM', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  onClick={() => setEditingHolidayId(h.id)}
                  title="Edit date"
                  aria-label={`Edit date for ${h.name}`}
                  className="text-gray-400 hover:text-sky-500 dark:text-gray-500 dark:hover:text-sky-400"
                >
                  <Pencil size={14} />
                </button>
              </>
            )}
            {!h.interacted && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Review</span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 flex gap-3">
        <button id="tour-academic-calendar-wizard-back" type="button" onClick={() => setStep(3)} className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
          ← Back
        </button>
        <button id="tour-academic-calendar-wizard-next" type="button" onClick={goToStep5} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
          Next →
        </button>
      </div>
    </StepCard>
  );
}

export function ClosuresStep({
  customNSDs,
  updateCustomNSD,
  removeCustomNSD,
  addCustomNSD,
  setStep,
  goToStep6,
}: {
  customNSDs: CustomNSD[];
  updateCustomNSD: (id: number, changes: Partial<CustomNSD>) => void;
  removeCustomNSD: (id: number) => void;
  addCustomNSD: () => void;
  setStep: (step: number) => void;
  goToStep6: () => void;
}) {
  return (
    <StepCard title="Step 5 — Institution Non-School Days (Optional)">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Add any institution-specific closures not covered by public holidays above.
      </p>
      <div className="flex flex-col gap-4">
        {customNSDs.map((n) => (
          <div key={n.id} className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
            <div className="flex justify-between items-start mb-3">
              <div className="flex gap-2">
                <button
                  id={`tour-academic-calendar-nsd-${n.id}-type-single`}
                  type="button"
                  onClick={() => updateCustomNSD(n.id, { type: 'single' })}
                  className={`px-3 py-1 text-xs rounded-full border ${n.type === 'single' ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}
                >
                  Single date
                </button>
                <button
                  id={`tour-academic-calendar-nsd-${n.id}-type-range`}
                  type="button"
                  onClick={() => updateCustomNSD(n.id, { type: 'range' })}
                  className={`px-3 py-1 text-xs rounded-full border ${n.type === 'range' ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}
                >
                  Date range
                </button>
              </div>
              <button id={`tour-academic-calendar-nsd-${n.id}-remove`} type="button" onClick={() => removeCustomNSD(n.id)} className="text-xs text-red-500 hover:underline">
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {n.type === 'single' ? (
                <Label>
                  Date
                  <DateInput id={`tour-academic-calendar-nsd-${n.id}-date`} value={n.date} onChange={(v) => updateCustomNSD(n.id, { date: v })} />
                </Label>
              ) : (
                <>
                  <Label>
                    Start date
                    <DateInput id={`tour-academic-calendar-nsd-${n.id}-start`} value={n.startDate} onChange={(v) => updateCustomNSD(n.id, { startDate: v })} />
                  </Label>
                  <Label>
                    End date
                    <DateInput id={`tour-academic-calendar-nsd-${n.id}-end`} value={n.endDate} onChange={(v) => updateCustomNSD(n.id, { endDate: v })} min={n.startDate} />
                  </Label>
                </>
              )}
              <Label>
                Reason (max 100 chars)
                <TextInput
                  id={`tour-academic-calendar-nsd-${n.id}-reason`}
                  value={n.reason}
                  onChange={(v) => updateCustomNSD(n.id, { reason: v.slice(0, 100) })}
                  placeholder="e.g. Pre-Christmas closure"
                  maxLength={100}
                />
              </Label>
            </div>
          </div>
        ))}
      </div>
      <button
        id="tour-academic-calendar-add-nsd"
        type="button"
        onClick={addCustomNSD}
        className="mt-3 text-sm text-sky-600 hover:underline"
      >
        + Add non-school day
      </button>
      <div className="mt-6 flex gap-3">
        <button id="tour-academic-calendar-wizard-back" type="button" onClick={() => setStep(4)} className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
          ← Back
        </button>
        <button id="tour-academic-calendar-wizard-next" type="button" onClick={goToStep6} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
          Next →
        </button>
      </div>
    </StepCard>
  );
}

export function ReviewStep({
  yearStart,
  yearEnd,
  terms,
  schoolWeekDays,
  holidays,
  customNSDs,
  draftYear,
  submitting,
  confirm,
  setStep,
}: {
  yearStart: string;
  yearEnd: string;
  terms: WizardTerm[];
  schoolWeekDays: number[];
  holidays: WizardHoliday[];
  customNSDs: CustomNSD[];
  draftYear: (AcademicYearDocument & { id: string }) | undefined;
  submitting: boolean;
  confirm: () => Promise<void>;
  setStep: (step: number) => void;
}) {
  return (
    <StepCard title="Step 6 — Review and Confirm">
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-medium text-gray-700 dark:text-gray-200">Academic Year</p>
          <p className="text-gray-500 dark:text-gray-400">{buildYearName(yearStart, yearEnd)} ({yearStart} → {yearEnd})</p>
        </div>
        <div>
          <p className="font-medium text-gray-700 dark:text-gray-200">Terms</p>
          {terms.map((t) => (
            <p key={t.number} className="text-gray-500 dark:text-gray-400">
              Term {t.number}: {t.name} ({t.startDate} → {t.endDate})
            </p>
          ))}
        </div>
        <div>
          <p className="font-medium text-gray-700 dark:text-gray-200">School week</p>
          <p className="text-gray-500 dark:text-gray-400">
            {ALL_WEEK_DAYS.filter((d) => schoolWeekDays.includes(d.value)).map((d) => d.label).join(', ')}
          </p>
        </div>
        <div>
          <p className="font-medium text-gray-700 dark:text-gray-200">
            Public holidays observed ({holidays.filter((h) => h.confirmed).length})
          </p>
          <ul className="text-gray-500 dark:text-gray-400 list-disc list-inside">
            {holidays.filter((h) => h.confirmed).map((h) => (
              <li key={h.id}>{h.name} ({h.isoDate})</li>
            ))}
          </ul>
        </div>
        {customNSDs.length > 0 && (
          <div>
            <p className="font-medium text-gray-700 dark:text-gray-200">
              Custom non-school days ({customNSDs.length})
            </p>
            {customNSDs.map((n) => (
              <p key={n.id} className="text-gray-500 dark:text-gray-400">
                {n.type === 'single' ? n.date : `${n.startDate} → ${n.endDate}`} — {n.reason}
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="mt-6 flex gap-3">
        <button id="tour-academic-calendar-wizard-back" type="button" onClick={() => setStep(5)} className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
          ← Back
        </button>
        <button
          id="tour-academic-calendar-publish"
          type="button"
          onClick={confirm}
          disabled={submitting}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-green-400"
        >
          {draftYear
            ? (submitting ? 'Saving…' : 'Save Draft Changes')
            : (submitting ? 'Activating…' : 'Confirm and Activate')}
        </button>
      </div>
    </StepCard>
  );
}
