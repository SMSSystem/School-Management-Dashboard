import { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, AcademicYearDocument, TermDocument, NonSchoolDayDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { getJamaicanPublicHolidays, PublicHoliday } from '@/lib/holidays';

// ─── helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildYearName(start: string, end: string): string {
  return `${start.slice(0, 4)}–${end.slice(0, 4)}`;
}

function addOneYear(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return toISO(d);
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  });
}

function nextSchoolMonday(isoDate: string, holidaySet: Set<string>): string {
  const d = new Date(isoDate + 'T12:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 1 ? 0 : (8 - day) % 7));
  while (holidaySet.has(toISO(d))) d.setUTCDate(d.getUTCDate() + 7);
  return toISO(d);
}

// ─── Wizard types ─────────────────────────────────────────────────────────────

interface WizardTerm {
  number: 1 | 2 | 3;
  name: string;
  defaultName: string;
  startDate: string;
  endDate: string;
}

interface WizardHoliday {
  name: string;
  date: Date;
  isoDate: string;
  interacted: boolean;
  confirmed: boolean;
}

interface CustomNSD {
  id: number;
  type: 'single' | 'range';
  date: string;
  startDate: string;
  endDate: string;
  reason: string;
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="h-8 w-8 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-red-500 mt-0.5">{msg}</p>;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 dark:text-gray-200">
      {children}
    </label>
  );
}

function DateInput({ value, onChange, min, max }: { value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
    />
  );
}

function TextInput({ value, onChange, placeholder, maxLength }: { value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number }) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
    />
  );
}

function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-6 max-w-2xl">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

const DEFAULT_TERMS: Omit<WizardTerm, 'startDate' | 'endDate'>[] = [
  { number: 1, name: 'Christmas Term', defaultName: 'Christmas Term' },
  { number: 2, name: 'Easter Term',    defaultName: 'Easter Term' },
  { number: 3, name: 'Summer Term',    defaultName: 'Summer Term' },
];

const ALL_WEEK_DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

function AcademicYearWizard({ onDone }: { onDone: () => void }) {
  const { user, institutionId } = useAuth();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: year dates
  const [yearStart, setYearStart] = useState('');
  const [yearEnd,   setYearEnd]   = useState('');

  // Step 2: terms
  const [terms, setTerms] = useState<WizardTerm[]>([]);

  // Step 3: school week
  const [schoolWeekDays, setSchoolWeekDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // Step 4: public holidays
  const [holidays, setHolidays] = useState<WizardHoliday[]>([]);

  // Step 5: custom non-school days
  const [customNSDs, setCustomNSDs] = useState<CustomNSD[]>([]);
  const nsdCounter = useRef(0);

  // Beforeunload guard while wizard is active
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ── Step 1 → Step 2: populate default term dates from year dates
  function goToStep2() {
    if (!yearStart || !yearEnd || yearEnd <= yearStart) {
      setError('Enter valid start and end dates (end must be after start).');
      return;
    }
    setError(null);
    const year = parseInt(yearStart.slice(0, 4));
    const holidaySet = new Set(
      [...getJamaicanPublicHolidays(year), ...getJamaicanPublicHolidays(year + 1)].map((h) => toISO(h.date))
    );
    setTerms([
      { number: 1, name: 'Christmas Term', defaultName: 'Christmas Term', startDate: nextSchoolMonday(`${year}-09-01`, holidaySet),     endDate: `${year}-12-20` },
      { number: 2, name: 'Easter Term',    defaultName: 'Easter Term',    startDate: nextSchoolMonday(`${year + 1}-01-06`, holidaySet), endDate: `${year + 1}-04-04` },
      { number: 3, name: 'Summer Term',    defaultName: 'Summer Term',    startDate: nextSchoolMonday(`${year + 1}-04-22`, holidaySet), endDate: `${year + 1}-08-15` },
    ]);
    setStep(2);
  }

  // ── Step 2 → Step 3: validate term dates
  function goToStep3() {
    for (const t of terms) {
      if (!t.name.trim()) { setError(`Term ${t.number} name is required.`); return; }
      if (!t.startDate || !t.endDate || t.endDate <= t.startDate) {
        setError(`Term ${t.number}: end date must be after start date.`); return;
      }
    }
    setError(null);
    setStep(3);
  }

  // ── Step 3 → Step 4: populate holidays for the year
  function goToStep4() {
    if (schoolWeekDays.length === 0) { setError('Select at least one school day.'); return; }
    setError(null);
    const year = parseInt(yearStart.slice(0, 4));
    const raw = getJamaicanPublicHolidays(year);
    const nextYearRaw = getJamaicanPublicHolidays(year + 1);
    // Include holidays from both years that fall within the academic year
    const combined = [...raw, ...nextYearRaw];
    const filtered = combined.filter((h) => {
      const iso = toISO(h.date);
      return iso >= yearStart && iso <= yearEnd;
    });
    setHolidays(
      filtered.map((h) => ({
        name: h.name,
        date: h.date,
        isoDate: toISO(h.date),
        interacted: false,
        confirmed: true, // default checked, user must explicitly interact
      }))
    );
    setStep(4);
  }

  function toggleHoliday(isoDate: string) {
    setHolidays((prev) =>
      prev.map((h) =>
        h.isoDate === isoDate ? { ...h, confirmed: !h.confirmed, interacted: true } : h
      )
    );
  }

  // ── Step 4 → Step 5: all holidays must be interacted with
  function goToStep5() {
    const notInteracted = holidays.filter((h) => !h.interacted);
    if (notInteracted.length > 0) {
      setError(`Please check or uncheck each holiday before proceeding. ${notInteracted.length} holiday(s) not reviewed.`);
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
    for (const n of customNSDs) {
      if (!n.reason.trim()) { setError('Each non-school day entry requires a reason.'); return; }
      if (n.type === 'single' && !n.date) { setError('Each single non-school day requires a date.'); return; }
      if (n.type === 'range' && (!n.startDate || !n.endDate)) { setError('Each date range requires start and end dates.'); return; }
      if (n.type === 'range' && n.endDate < n.startDate) { setError('Range end date must be on or after start date.'); return; }
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
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      const todayISO = now.slice(0, 10);
      const yearName = buildYearName(yearStart, yearEnd);
      const yearId = `${institutionId}_${yearName}`;

      // Academic year
      batch.set(doc(db, 'academicYears', yearId), {
        institutionId,
        name: yearName,
        startDate: yearStart,
        endDate: yearEnd,
        status: 'active',
        schoolWeekDays,
        createdAt: serverTimestamp(),
        confirmedAt: now,
        confirmedBy: user.uid,
      });

      // Terms
      for (const t of terms) {
        const termId = `${yearId}_${t.number}`;
        batch.set(doc(db, 'terms', termId), {
          institutionId,
          academicYearId: yearId,
          termNumber: t.number,
          name: t.name,
          defaultName: t.defaultName,
          startDate: t.startDate,
          endDate: t.endDate,
          status: t.endDate < todayISO ? 'completed' : t.startDate <= todayISO ? 'active' : 'upcoming',
        });
      }

      // Public holiday non-school days
      for (const h of holidays.filter((h) => h.confirmed)) {
        await addDoc(collection(db, 'nonSchoolDays'), {
          institutionId,
          academicYearId: yearId,
          type: 'single',
          date: h.isoDate,
          reason: h.name,
          source: 'public_holiday',
          isActive: true,
          createdAt: serverTimestamp(),
        });
      }

      // Custom non-school days (not in batch since addDoc doesn't support batch easily for auto-IDs; we batch the year + terms)
      await batch.commit();

      for (const n of customNSDs) {
        await addDoc(collection(db, 'nonSchoolDays'), {
          institutionId,
          academicYearId: yearId,
          type: n.type,
          ...(n.type === 'single' ? { date: n.date } : { startDate: n.startDate, endDate: n.endDate }),
          reason: n.reason,
          source: 'institution_specific',
          isActive: true,
          createdAt: serverTimestamp(),
        });
      }

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

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Academic Calendar Setup
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        This is a one-time setup. Configure your academic year, terms, school week, and non-school days.
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

      {/* ── Step 1: Year dates ── */}
      {step === 1 && (
        <StepCard title="Step 1 — Academic Year Dates">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Label>
              Start date
              <DateInput value={yearStart} onChange={setYearStart} />
            </Label>
            <Label>
              End date
              <DateInput value={yearEnd} onChange={(v) => setYearEnd(v)} min={yearStart} />
            </Label>
          </div>
          <button type="button" onClick={goToStep2} className="mt-6 rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
            Next →
          </button>
        </StepCard>
      )}

      {/* ── Step 2: Terms ── */}
      {step === 2 && (
        <StepCard title="Step 2 — Term Names and Dates">
          <div className="flex flex-col gap-6">
            {terms.map((t) => (
              <div key={t.number} className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Term {t.number}</span>
                  {t.name !== t.defaultName && (
                    <button
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
                    <TextInput value={t.name} onChange={(v) => updateTerm(t.number, { name: v })} maxLength={80} />
                  </Label>
                  <Label>
                    Start date
                    <DateInput value={t.startDate} onChange={(v) => updateTerm(t.number, { startDate: v })} />
                  </Label>
                  <Label>
                    End date
                    <DateInput value={t.endDate} onChange={(v) => updateTerm(t.number, { endDate: v })} min={t.startDate} />
                  </Label>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => setStep(1)} className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
              ← Back
            </button>
            <button type="button" onClick={goToStep3} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
              Next →
            </button>
          </div>
        </StepCard>
      )}

      {/* ── Step 3: School week ── */}
      {step === 3 && (
        <StepCard title="Step 3 — School Week">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Select the days of the week that are instructional (at least one required).
          </p>
          <div className="flex gap-3 flex-wrap">
            {ALL_WEEK_DAYS.map(({ label, value }) => (
              <button
                key={value}
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
            <button type="button" onClick={() => setStep(2)} className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
              ← Back
            </button>
            <button type="button" onClick={goToStep4} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
              Next →
            </button>
          </div>
        </StepCard>
      )}

      {/* ── Step 4: Public holidays ── */}
      {step === 4 && (
        <StepCard title="Step 4 — Public Holidays">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
            Check each holiday that your institution observes. You must interact with every item before proceeding.
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
            Unchecked holidays will still be school days. Check only the ones your institution observes.
          </p>
          <div className="flex flex-col gap-2">
            {holidays.map((h) => (
              <label
                key={h.isoDate}
                className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer ${
                  h.interacted
                    ? 'border-gray-200 dark:border-gray-700'
                    : 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10'
                }`}
              >
                <input
                  type="checkbox"
                  checked={h.confirmed}
                  onChange={() => toggleHoliday(h.isoDate)}
                  className="h-4 w-4 rounded border-gray-300 text-sky-500"
                />
                <span className="flex-1 text-sm text-gray-900 dark:text-gray-100">{h.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                  {new Date(h.isoDate + 'T12:00:00Z').toLocaleDateString('en-JM', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                {!h.interacted && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Review</span>
                )}
              </label>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => setStep(3)} className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
              ← Back
            </button>
            <button type="button" onClick={goToStep5} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
              Next →
            </button>
          </div>
        </StepCard>
      )}

      {/* ── Step 5: Non-school days ── */}
      {step === 5 && (
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
                      type="button"
                      onClick={() => updateCustomNSD(n.id, { type: 'single' })}
                      className={`px-3 py-1 text-xs rounded-full border ${n.type === 'single' ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}
                    >
                      Single date
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCustomNSD(n.id, { type: 'range' })}
                      className={`px-3 py-1 text-xs rounded-full border ${n.type === 'range' ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}
                    >
                      Date range
                    </button>
                  </div>
                  <button type="button" onClick={() => removeCustomNSD(n.id)} className="text-xs text-red-500 hover:underline">
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {n.type === 'single' ? (
                    <Label>
                      Date
                      <DateInput value={n.date} onChange={(v) => updateCustomNSD(n.id, { date: v })} />
                    </Label>
                  ) : (
                    <>
                      <Label>
                        Start date
                        <DateInput value={n.startDate} onChange={(v) => updateCustomNSD(n.id, { startDate: v })} />
                      </Label>
                      <Label>
                        End date
                        <DateInput value={n.endDate} onChange={(v) => updateCustomNSD(n.id, { endDate: v })} min={n.startDate} />
                      </Label>
                    </>
                  )}
                  <Label>
                    Reason (max 100 chars)
                    <TextInput
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
            type="button"
            onClick={addCustomNSD}
            className="mt-3 text-sm text-sky-600 hover:underline"
          >
            + Add non-school day
          </button>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => setStep(4)} className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
              ← Back
            </button>
            <button type="button" onClick={goToStep6} className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600">
              Next →
            </button>
          </div>
        </StepCard>
      )}

      {/* ── Step 6: Review ── */}
      {step === 6 && (
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
                  <li key={h.isoDate}>{h.name} ({h.isoDate})</li>
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
            <button type="button" onClick={() => setStep(5)} className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
              ← Back
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={submitting}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-green-400"
            >
              {submitting ? 'Activating…' : 'Confirm and Activate'}
            </button>
          </div>
        </StepCard>
      )}
    </div>
  );
}

// ─── Draft Year Confirmation ───────────────────────────────────────────────────

function DraftYearConfirmation({
  draftYear,
  previousYearId,
  onDone,
}: {
  draftYear: AcademicYearDocument & { id: string };
  previousYearId: string | null;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const batch = writeBatch(db);
      // Activate the draft year
      batch.update(doc(db, 'academicYears', draftYear.id), {
        status: 'active',
        confirmedAt: new Date().toISOString(),
        confirmedBy: user.uid,
      });
      // Mark previous year completed
      if (previousYearId) {
        batch.update(doc(db, 'academicYears', previousYearId), { status: 'completed' });
      }
      await batch.commit();
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
            Term dates and non-school days can be edited after activation on the management view.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <a
            href="/academic-calendar"
            className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Edit details first
          </a>
          <button
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

// ─── Management View ───────────────────────────────────────────────────────────

function AcademicCalendarManagementView({
  activeYear,
  draftYear,
  terms: activeTerms,
  nonSchoolDays,
}: {
  activeYear: AcademicYearDocument & { id: string };
  draftYear: (AcademicYearDocument & { id: string }) | null;
  terms: (TermDocument & { id: string })[];
  nonSchoolDays: (NonSchoolDayDocument & { id: string })[];
}) {
  const { institutionId } = useAuth();
  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [termEdits, setTermEdits] = useState<Partial<TermDocument>>({});
  const [savingTerm, setSavingTerm] = useState(false);
  const [addingNSD, setAddingNSD] = useState(false);
  const [newNSD, setNewNSD] = useState<Omit<CustomNSD, 'id'>>({ type: 'single', date: '', startDate: '', endDate: '', reason: '' });
  const [nsdError, setNsdError] = useState<string | null>(null);

  async function saveTerm(termId: string) {
    setSavingTerm(true);
    try {
      await updateDoc(doc(db, 'terms', termId), termEdits);
      setEditingTermId(null);
      setTermEdits({});
    } catch {
      // show no-op error inline if needed
    } finally {
      setSavingTerm(false);
    }
  }

  async function toggleNSD(nsd: NonSchoolDayDocument & { id: string }) {
    await updateDoc(doc(db, 'nonSchoolDays', nsd.id), { isActive: !nsd.isActive });
  }

  async function addNSD() {
    if (!institutionId) return;
    if (!newNSD.reason.trim()) { setNsdError('Reason is required.'); return; }
    if (newNSD.type === 'single' && !newNSD.date) { setNsdError('Date is required.'); return; }
    if (newNSD.type === 'range' && (!newNSD.startDate || !newNSD.endDate)) { setNsdError('Start and end dates are required.'); return; }
    setNsdError(null);
    await addDoc(collection(db, 'nonSchoolDays'), {
      institutionId,
      academicYearId: activeYear.id,
      type: newNSD.type,
      ...(newNSD.type === 'single' ? { date: newNSD.date } : { startDate: newNSD.startDate, endDate: newNSD.endDate }),
      reason: newNSD.reason,
      source: 'institution_specific',
      isActive: true,
      createdAt: serverTimestamp(),
    });
    setAddingNSD(false);
    setNewNSD({ type: 'single', date: '', startDate: '', endDate: '', reason: '' });
  }

  const sortedTerms = [...activeTerms].sort((a, b) => (a.termNumber ?? 0) - (b.termNumber ?? 0));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Academic Calendar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {activeYear.name} · {formatDate(activeYear.startDate)} → {formatDate(activeYear.endDate)}
          </p>
        </div>
        {draftYear && (
          <a
            href="/academic-calendar"
            className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md px-3 py-1.5"
          >
            {draftYear.name} pending →
          </a>
        )}
      </div>

      {/* Terms */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Terms</h2>
        <div className="space-y-3">
          {sortedTerms.map((t) => (
            <div key={t.id} className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
              {editingTermId === t.id ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Label>
                    Name
                    <TextInput
                      value={termEdits.name ?? t.name}
                      onChange={(v) => setTermEdits((prev) => ({ ...prev, name: v }))}
                      maxLength={80}
                    />
                  </Label>
                  <Label>
                    Start date
                    <DateInput
                      value={(termEdits.startDate ?? t.startDate) as string}
                      onChange={(v) => setTermEdits((prev) => ({ ...prev, startDate: v }))}
                    />
                  </Label>
                  <Label>
                    End date
                    <DateInput
                      value={(termEdits.endDate ?? t.endDate) as string}
                      onChange={(v) => setTermEdits((prev) => ({ ...prev, endDate: v }))}
                    />
                  </Label>
                  <div className="sm:col-span-3 flex gap-2 mt-1">
                    <button type="button" onClick={() => saveTerm(t.id)} disabled={savingTerm} className="text-xs font-medium text-sky-600 hover:underline disabled:text-gray-400">
                      {savingTerm ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => { setEditingTermId(null); setTermEdits({}); }} className="text-xs text-gray-500 hover:underline">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(t.startDate)} → {formatDate(t.endDate)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditingTermId(t.id); setTermEdits({}); }}
                    className="text-xs text-sky-600 hover:underline"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Non-school days */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Non-School Days</h2>
          <button type="button" onClick={() => setAddingNSD(true)} className="text-xs text-sky-600 hover:underline">
            + Add
          </button>
        </div>

        {addingNSD && (
          <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-md p-4 space-y-3">
            <div className="flex gap-2">
              {(['single', 'range'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewNSD((prev) => ({ ...prev, type: t }))}
                  className={`px-3 py-1 text-xs rounded-full border ${newNSD.type === t ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}
                >
                  {t === 'single' ? 'Single date' : 'Date range'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {newNSD.type === 'single' ? (
                <Label>Date<DateInput value={newNSD.date} onChange={(v) => setNewNSD((p) => ({ ...p, date: v }))} /></Label>
              ) : (
                <>
                  <Label>Start<DateInput value={newNSD.startDate} onChange={(v) => setNewNSD((p) => ({ ...p, startDate: v }))} /></Label>
                  <Label>End<DateInput value={newNSD.endDate} onChange={(v) => setNewNSD((p) => ({ ...p, endDate: v }))} /></Label>
                </>
              )}
              <Label>
                Reason (max 100 chars)
                <TextInput value={newNSD.reason} onChange={(v) => setNewNSD((p) => ({ ...p, reason: v.slice(0, 100) }))} placeholder="e.g. School sports day" maxLength={100} />
              </Label>
            </div>
            {nsdError && <p className="text-xs text-red-500">{nsdError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={addNSD} className="text-xs font-medium text-sky-600 hover:underline">Save</button>
              <button type="button" onClick={() => setAddingNSD(false)} className="text-xs text-gray-500 hover:underline">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {nonSchoolDays.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">No non-school days configured.</p>
          )}
          {nonSchoolDays.map((n) => (
            <div key={n.id} className={`flex items-center justify-between rounded-md border px-3 py-2 ${n.isActive ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-60'}`}>
              <div>
                <span className="text-sm text-gray-900 dark:text-gray-100">{n.reason}</span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  {n.type === 'single' ? formatDate(n.date) : `${formatDate(n.startDate)} → ${formatDate(n.endDate)}`}
                </span>
                {n.source === 'public_holiday' && (
                  <span className="ml-2 text-[10px] text-gray-400 dark:text-gray-500">public holiday</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggleNSD(n)}
                className="text-xs text-sky-600 hover:underline"
              >
                {n.isActive ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AcademicCalendarPage() {
  const { user, institutionId } = useAuth();
  const { activeYear, draftYear, allTerms, nonSchoolDays, loading } = useInstitutionAcademicCalendar();

  // Auto-generate next year draft when the active year has ended
  useEffect(() => {
    if (USE_MOCK || !activeYear || draftYear || !user || !institutionId) return;
    const today = new Date().toISOString().slice(0, 10);
    if (today <= activeYear.endDate) return;

    const nextStart = addOneYear(activeYear.startDate);
    const nextEnd   = addOneYear(activeYear.endDate);
    const nextName  = buildYearName(nextStart, nextEnd);

    addDoc(collection(db, 'academicYears'), {
      institutionId,
      name: nextName,
      startDate: nextStart,
      endDate: nextEnd,
      status: 'draft',
      schoolWeekDays: activeYear.schoolWeekDays,
      createdAt: serverTimestamp(),
    }).catch(() => {});
  }, [activeYear, draftYear, user, institutionId]);

  if (USE_MOCK) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Academic Calendar is not available in demo mode.
        </p>
      </div>
    );
  }

  if (loading) return <div className="p-6"><Spinner /></div>;

  // First-time setup: no active year and no draft
  if (!activeYear && !draftYear) {
    return <AcademicYearWizard onDone={() => {}} />;
  }

  // Draft exists but no active year: show confirmation view
  if (!activeYear && draftYear) {
    return (
      <DraftYearConfirmation
        draftYear={draftYear}
        previousYearId={null}
        onDone={() => {}}
      />
    );
  }

  // Active year exists — wait for hook's terms snapshot to deliver
  if (allTerms === null) return <div className="p-6"><Spinner /></div>;

  return (
    <AcademicCalendarManagementView
      activeYear={activeYear!}
      draftYear={draftYear}
      terms={allTerms}
      nonSchoolDays={nonSchoolDays}
    />
  );
}
