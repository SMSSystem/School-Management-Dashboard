import { useEffect, useRef, useState } from 'react';
import type { AcademicYearDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { createAcademicYear, fetchDraftYearDetails, saveDraftYear } from '@/lib/academicCalendarSave';
import {
  defaultTermsFor,
  initialHolidaysFor,
  validateCustomNonSchoolDays,
  validateHolidaysReviewed,
  validateSchoolWeekDays,
  validateTerms,
  validateYearDates,
  type CustomNSD,
  type WizardHoliday,
  type WizardTerm,
} from '@/lib/academicCalendarLogic';
import { Spinner } from './CalendarFields';
import { YearDatesStep, TermsStep, SchoolWeekStep, HolidaysStep, ClosuresStep, ReviewStep } from './WizardSteps';

export function AcademicYearWizard({
  draftYear,
  onDone,
}: {
  draftYear?: AcademicYearDocument & { id: string };
  onDone: () => void;
}) {
  const { user, institutionId } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(!!draftYear);

  // Step 1: year dates
  const [yearStart, setYearStart] = useState(draftYear?.startDate ?? '');
  const [yearEnd,   setYearEnd]   = useState(draftYear?.endDate ?? '');

  // Step 2: terms
  const [terms, setTerms] = useState<WizardTerm[]>([]);
  // Tracks which yearStart|yearEnd range `terms` was populated for (edit mode
  // only, DEV_NOTES Item 12.2) — lets goToStep2 preserve a loaded/edited draft
  // instead of unconditionally regenerating defaults, unless the dates changed.
  const termsRangeRef = useRef<string | null>(null);

  // Step 3: school week
  const [schoolWeekDays, setSchoolWeekDays] = useState<number[]>(draftYear?.schoolWeekDays ?? [1, 2, 3, 4, 5]);

  // Step 4: public holidays
  const [holidays, setHolidays] = useState<WizardHoliday[]>([]);
  const [editingHolidayId, setEditingHolidayId] = useState<number | null>(null);
  const holidaysRangeRef = useRef<string | null>(null);

  // Step 5: custom non-school days
  const [customNSDs, setCustomNSDs] = useState<CustomNSD[]>([]);
  const nsdCounter = useRef(0);

  // Editing an existing draft (Item 12.2): load its already-persisted terms
  // and non-school days once, so a second edit pass doesn't discard a manual
  // holiday exclusion or term rename made during a previous save. A draft
  // freshly auto-generated (never saved through this wizard before) has none
  // of these yet, so the loaded arrays are simply empty and Steps 2/4 fall
  // back to generating defaults exactly like the blank/first-time flow.
  useEffect(() => {
    if (!draftYear || !institutionId) return;
    let cancelled = false;
    (async () => {
      try {
        const { terms: loadedTerms, holidays: loadedHolidays, customNSDs: loadedNSDs } = await fetchDraftYearDetails(
          institutionId,
          draftYear.id,
        );
        if (cancelled) return;

        const rangeKey = `${draftYear.startDate}|${draftYear.endDate}`;

        if (loadedTerms.length > 0) {
          setTerms(loadedTerms);
          termsRangeRef.current = rangeKey;
        }

        if (loadedHolidays.length > 0) {
          setHolidays(loadedHolidays);
          holidaysRangeRef.current = rangeKey;
        }

        if (loadedNSDs.length > 0) {
          setCustomNSDs(loadedNSDs);
          nsdCounter.current = loadedNSDs.length;
        }
      } catch {
        // Wizard falls back to defaults seeded from draftYear's own fields
        // (yearStart/yearEnd/schoolWeekDays) rather than being stuck loading
        // forever — the admin can still proceed, just without previously
        // saved term/holiday edits carried over.
        if (!cancelled) {
          setError("Failed to load this draft year's saved terms and holidays. Check your connection and try again.");
        }
      } finally {
        if (!cancelled) setLoadingDraft(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftYear?.id, institutionId]);

  // Beforeunload guard while wizard is active
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ── Step 1 → Step 2: populate default term dates from year dates
  function goToStep2() {
    const invalidDates = validateYearDates(yearStart, yearEnd);
    if (invalidDates) {
      setError(invalidDates);
      return;
    }
    setError(null);
    const rangeKey = `${yearStart}|${yearEnd}`;
    // Editing a draft whose terms were already loaded/edited for this exact
    // date range: keep them. Otherwise (blank flow, or dates changed since
    // load) generate fresh defaults, same as always.
    if (!draftYear || termsRangeRef.current !== rangeKey) {
      setTerms(defaultTermsFor(yearStart));
      termsRangeRef.current = rangeKey;
    }
    setStep(2);
  }

  // ── Step 2 → Step 3: validate term dates
  function goToStep3() {
    const invalidTerms = validateTerms(terms);
    if (invalidTerms) {
      setError(invalidTerms);
      return;
    }
    setError(null);
    setStep(3);
  }

  // ── Step 3 → Step 4: populate holidays for the year
  function goToStep4() {
    const invalidWeek = validateSchoolWeekDays(schoolWeekDays);
    if (invalidWeek) {
      setError(invalidWeek);
      return;
    }
    setError(null);
    const rangeKey = `${yearStart}|${yearEnd}`;
    // Editing a draft whose holidays were already loaded/edited for this exact
    // date range: keep them (preserves any date override from Item 12.1 and
    // which ones were already reviewed). Otherwise generate fresh, as always.
    if (!draftYear || holidaysRangeRef.current !== rangeKey) {
      setHolidays(initialHolidaysFor(yearStart, yearEnd));
      setEditingHolidayId(null);
      holidaysRangeRef.current = rangeKey;
    }
    setStep(4);
  }

  function toggleHoliday(id: number) {
    setHolidays((prev) =>
      prev.map((h) =>
        h.id === id ? { ...h, confirmed: !h.confirmed, interacted: true } : h
      )
    );
  }

  // Manual date override (DEV_NOTES Item 12.1) — one-off, this draft only; does
  // not affect `interacted`, which is a separate observed/not-observed decision.
  function editHolidayDate(id: number, isoDate: string) {
    setHolidays((prev) =>
      prev.map((h) =>
        h.id === id ? { ...h, isoDate, date: new Date(isoDate + 'T12:00:00Z') } : h
      )
    );
  }

  // ── Step 4 → Step 5: all holidays must be interacted with
  function goToStep5() {
    const notReviewed = validateHolidaysReviewed(holidays);
    if (notReviewed) {
      setError(notReviewed);
      return;
    }
    setError(null);
    setStep(5);
  }

  function addCustomNSD() {
    nsdCounter.current += 1;
    setCustomNSDs((prev) => [
      ...prev,
      { id: nsdCounter.current, type: 'single', date: '', startDate: '', endDate: '', reason: '' },
    ]);
  }

  function updateCustomNSD(id: number, changes: Partial<CustomNSD>) {
    setCustomNSDs((prev) => prev.map((n) => (n.id === id ? { ...n, ...changes } : n)));
  }

  function removeCustomNSD(id: number) {
    setCustomNSDs((prev) => prev.filter((n) => n.id !== id));
  }

  // ── Step 5 → Step 6: validate custom non-school days
  function goToStep6() {
    const invalidClosures = validateCustomNonSchoolDays(customNSDs);
    if (invalidClosures) {
      setError(invalidClosures);
      return;
    }
    setError(null);
    setStep(6);
  }

  // ── Final: batch write everything
  async function confirm() {
    if (!user || !institutionId) return;
    setSubmitting(true);
    setError(null);
    try {
      if (draftYear) {
        await saveDraftYear({ institutionId, yearId: draftYear.id, yearStart, yearEnd, schoolWeekDays, terms, holidays, customNSDs });
        onDone();
        return;
      }

      await createAcademicYear({ institutionId, uid: user.uid, yearStart, yearEnd, schoolWeekDays, terms, holidays, customNSDs });
      onDone();
    } catch {
      setError('Failed to save. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  function updateTerm(number: 1 | 2 | 3, changes: Partial<WizardTerm>) {
    setTerms((prev) => prev.map((t) => (t.number === number ? { ...t, ...changes } : t)));
  }

  const steps = ['Year dates', 'Terms', 'School week', 'Public holidays', 'Non-school days', 'Review'];

  if (loadingDraft) return <div className="p-6"><Spinner /></div>;

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {draftYear ? `Edit Draft — ${draftYear.name}` : 'Academic Calendar Setup'}
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {draftYear
          ? 'Adjust the auto-generated draft below. Changes are saved back to this draft only — activation happens on the confirmation screen.'
          : 'This is a one-time setup. Configure your academic year, terms, school week, and non-school days.'}
      </p>

      {/* Step indicator */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {steps.map((label, i) => (
          <div
            key={label}
            className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
              step === i + 1
                ? 'bg-sky-500 text-white'
                : step > i + 1
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            <span>{i + 1}.</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Step 1 ── */}
      {step === 1 && (
        <YearDatesStep
          yearStart={yearStart}
          setYearStart={setYearStart}
          yearEnd={yearEnd}
          setYearEnd={setYearEnd}
          goToStep2={goToStep2}
        />
      )}

      {/* ── Step 2 ── */}
      {step === 2 && (
        <TermsStep
          terms={terms}
          updateTerm={updateTerm}
          setStep={setStep}
          goToStep3={goToStep3}
        />
      )}

      {/* ── Step 3 ── */}
      {step === 3 && (
        <SchoolWeekStep
          schoolWeekDays={schoolWeekDays}
          setSchoolWeekDays={setSchoolWeekDays}
          setStep={setStep}
          goToStep4={goToStep4}
        />
      )}

      {/* ── Step 4 ── */}
      {step === 4 && (
        <HolidaysStep
          holidays={holidays}
          toggleHoliday={toggleHoliday}
          editingHolidayId={editingHolidayId}
          setEditingHolidayId={setEditingHolidayId}
          editHolidayDate={editHolidayDate}
          yearStart={yearStart}
          yearEnd={yearEnd}
          setStep={setStep}
          goToStep5={goToStep5}
        />
      )}

      {/* ── Step 5 ── */}
      {step === 5 && (
        <ClosuresStep
          customNSDs={customNSDs}
          updateCustomNSD={updateCustomNSD}
          removeCustomNSD={removeCustomNSD}
          addCustomNSD={addCustomNSD}
          setStep={setStep}
          goToStep6={goToStep6}
        />
      )}

      {/* ── Step 6 ── */}
      {step === 6 && (
        <ReviewStep
          yearStart={yearStart}
          yearEnd={yearEnd}
          terms={terms}
          schoolWeekDays={schoolWeekDays}
          holidays={holidays}
          customNSDs={customNSDs}
          draftYear={draftYear}
          submitting={submitting}
          confirm={confirm}
          setStep={setStep}
        />
      )}
    </div>
  );
}
