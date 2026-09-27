import { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Pencil } from 'lucide-react';
import { db, AcademicYearDocument, TermDocument, NonSchoolDayDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';
import { useInstitutionAcademicCalendar, type ActiveTimeBlock } from '@/hooks/useInstitutionAcademicCalendar';
import { queryClient } from '@/lib/queryClient';
import { getJamaicanPublicHolidays } from '@/lib/holidays';
import { institutionCollection, institutionDoc } from '@/lib/paths';

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

type DurationUnit = 'days' | 'weeks' | 'months';

function addDuration(startIso: string, count: number, unit: DurationUnit): string {
  const d = new Date(startIso + 'T12:00:00Z');
  if (unit === 'days') d.setUTCDate(d.getUTCDate() + count);
  else if (unit === 'weeks') d.setUTCDate(d.getUTCDate() + count * 7);
  else d.setUTCMonth(d.getUTCMonth() + count);
  return toISO(d);
}

// Inverse of addDuration — used by the quick-create flow (§9) to express an
// existing time block's own start/end dates as a {count, unit} pair, so its
// duration can be pre-filled as an editable default rather than re-derived
// from scratch. Prefers weeks when the span divides evenly (the common
// case — "10 weeks" reads better than "70 days"), otherwise falls back to
// days; months are deliberately never inferred back (a calendar-month span
// isn't a fixed day count, so round-tripping it isn't reliable).
function deriveDuration(startIso: string, endIso: string): { count: number; unit: DurationUnit } {
  const start = new Date(startIso + 'T12:00:00Z').getTime();
  const end = new Date(endIso + 'T12:00:00Z').getTime();
  const days = Math.round((end - start) / (24 * 60 * 60 * 1000));
  return days > 0 && days % 7 === 0 ? { count: days / 7, unit: 'weeks' } : { count: Math.max(days, 1), unit: 'days' };
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
  id: number;
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-gray-700 dark:text-gray-200">
      {children}
    </label>
  );
}

function DateInput({ id, value, onChange, min, max }: { id?: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return (
    <input
      id={id}
      type="date"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
    />
  );
}

function TextInput({ id, value, onChange, placeholder, maxLength }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number }) {
  return (
    <input
      id={id}
      type="text"
      autoComplete="off"
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

const ALL_WEEK_DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

function AcademicYearWizard({
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
        const [termsSnap, nsdSnap] = await Promise.all([
          getDocs(query(institutionCollection(institutionId, 'terms'), where('academicYearId', '==', draftYear.id))),
          getDocs(query(institutionCollection(institutionId, 'nonSchoolDays'), where('academicYearId', '==', draftYear.id))),
        ]);
        if (cancelled) return;

        const rangeKey = `${draftYear.startDate}|${draftYear.endDate}`;

        const loadedTerms = termsSnap.docs
          .map((d) => d.data() as TermDocument)
          .sort((a, b) => (a.termNumber ?? 0) - (b.termNumber ?? 0))
          .map((t) => ({
            number: t.termNumber as 1 | 2 | 3,
            name: t.name,
            defaultName: t.defaultName ?? t.name,
            startDate: t.startDate,
            endDate: t.endDate,
          }));
        if (loadedTerms.length > 0) {
          setTerms(loadedTerms);
          termsRangeRef.current = rangeKey;
        }

        let holidayIdCounter = 0;
        const loadedHolidays = nsdSnap.docs
          .map((d) => d.data() as NonSchoolDayDocument)
          .filter((n) => n.source === 'public_holiday' && n.date)
          .map((n) => ({
            id: holidayIdCounter++,
            name: n.reason,
            date: new Date(`${n.date}T12:00:00Z`),
            isoDate: n.date as string,
            interacted: true,
            confirmed: true,
          }));
        if (loadedHolidays.length > 0) {
          setHolidays(loadedHolidays);
          holidaysRangeRef.current = rangeKey;
        }

        const loadedNSDs = nsdSnap.docs
          .map((d) => d.data() as NonSchoolDayDocument)
          .filter((n) => n.source === 'institution_specific')
          .map((n, i): CustomNSD => ({
            id: i + 1,
            type: n.type,
            date: n.date ?? '',
            startDate: n.startDate ?? '',
            endDate: n.endDate ?? '',
            reason: n.reason,
          }));
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
    if (!yearStart || !yearEnd || yearEnd <= yearStart) {
      setError('Enter valid start and end dates (end must be after start).');
      return;
    }
    setError(null);
    const rangeKey = `${yearStart}|${yearEnd}`;
    // Editing a draft whose terms were already loaded/edited for this exact
    // date range: keep them. Otherwise (blank flow, or dates changed since
    // load) generate fresh defaults, same as always.
    if (!draftYear || termsRangeRef.current !== rangeKey) {
      const year = parseInt(yearStart.slice(0, 4));
      const holidaySet = new Set(
        [...getJamaicanPublicHolidays(year), ...getJamaicanPublicHolidays(year + 1)].map((h) => toISO(h.date))
      );
      setTerms([
        { number: 1, name: 'Christmas Term', defaultName: 'Christmas Term', startDate: nextSchoolMonday(`${year}-09-01`, holidaySet),     endDate: `${year}-12-20` },
        { number: 2, name: 'Easter Term',    defaultName: 'Easter Term',    startDate: nextSchoolMonday(`${year + 1}-01-06`, holidaySet), endDate: `${year + 1}-04-04` },
        { number: 3, name: 'Summer Term',    defaultName: 'Summer Term',    startDate: nextSchoolMonday(`${year + 1}-04-22`, holidaySet), endDate: `${year + 1}-08-15` },
      ]);
      termsRangeRef.current = rangeKey;
    }
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
    const rangeKey = `${yearStart}|${yearEnd}`;
    // Editing a draft whose holidays were already loaded/edited for this exact
    // date range: keep them (preserves any date override from Item 12.1 and
    // which ones were already reviewed). Otherwise generate fresh, as always.
    if (!draftYear || holidaysRangeRef.current !== rangeKey) {
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
        filtered.map((h, i) => ({
          id: i,
          name: h.name,
          date: h.date,
          isoDate: toISO(h.date),
          interacted: false,
          confirmed: true, // default checked, user must explicitly interact
        }))
      );
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
      const now = new Date().toISOString();
      const todayISO = now.slice(0, 10);

      if (draftYear) {
        // Editing an existing draft (Item 12.2): update the draft doc in
        // place (status stays 'draft' — activation is DraftYearConfirmation's
        // job), and delete-and-recreate its terms/non-school days so this
        // save fully reflects the wizard's current state.
        const yearId = draftYear.id;
        const batch = writeBatch(db);
        batch.update(institutionDoc(institutionId, 'academicYears', yearId), {
          startDate: yearStart,
          endDate: yearEnd,
          schoolWeekDays,
        });

        const [existingTermsSnap, existingNSDSnap] = await Promise.all([
          getDocs(query(institutionCollection(institutionId, 'terms'), where('academicYearId', '==', yearId))),
          getDocs(query(institutionCollection(institutionId, 'nonSchoolDays'), where('academicYearId', '==', yearId))),
        ]);
        // Preserve any admin-renamed grade-tracking period labels (Item 5.3)
        // across the delete-and-recreate below — term IDs are deterministic
        // (`${yearId}_${t.number}`), so the recreated doc for a given term
        // number is the same doc the override was saved on.
        const existingLabelOverrides = new Map<string, Record<string, string> | undefined>();
        existingTermsSnap.docs.forEach((d) => {
          existingLabelOverrides.set(d.id, (d.data() as TermDocument).periodLabelOverrides);
        });

        existingTermsSnap.docs.forEach((d) => batch.delete(d.ref));
        existingNSDSnap.docs.forEach((d) => batch.delete(d.ref));

        for (const t of terms) {
          const termId = `${yearId}_${t.number}`;
          const periodLabelOverrides = existingLabelOverrides.get(termId);
          batch.set(institutionDoc(institutionId, 'terms', termId), {
            institutionId,
            academicYearId: yearId,
            termNumber: t.number,
            name: t.name,
            defaultName: t.defaultName,
            startDate: t.startDate,
            endDate: t.endDate,
            status: t.endDate < todayISO ? 'completed' : t.startDate <= todayISO ? 'active' : 'upcoming',
            ...(periodLabelOverrides ? { periodLabelOverrides } : {}),
          });
        }

        // Confirmed holidays and custom non-school days join the same batch
        // as the year/term writes above rather than being written via
        // sequential addDoc calls — one atomic commit instead of N+1 round
        // trips, well within the batch's 500-write limit for realistic
        // holiday/NSD counts. addDoc doesn't support batching directly, so
        // doc(collectionRef) is used to pre-generate each auto-ID doc ref.
        for (const h of holidays.filter((h) => h.confirmed)) {
          const nsdRef = doc(institutionCollection(institutionId, 'nonSchoolDays'));
          batch.set(nsdRef, {
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

        for (const n of customNSDs) {
          const nsdRef = doc(institutionCollection(institutionId, 'nonSchoolDays'));
          batch.set(nsdRef, {
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

        await batch.commit();

        // Remediation plan §5, row 1 — this batch touches academicYears
        // (update), terms (delete+recreate), and nonSchoolDays
        // (delete+recreate), and none of it goes through FormModal, so
        // nothing else invalidates useInstitutionAcademicCalendar()'s cache
        // for it. Prefix-only keys ([collection, institutionId]) so this
        // matches both the academic-mode and custom-mode query key variants
        // (react-query's invalidateQueries does prefix matching by default).
        queryClient.invalidateQueries({ queryKey: ['academicYears', institutionId] });
        queryClient.invalidateQueries({ queryKey: ['terms', institutionId] });
        queryClient.invalidateQueries({ queryKey: ['nonSchoolDays', institutionId] });

        onDone();
        return;
      }

      const batch = writeBatch(db);
      const yearName = buildYearName(yearStart, yearEnd);
      const yearId = `${institutionId}_${yearName}`;

      // Academic year
      batch.set(institutionDoc(institutionId, 'academicYears', yearId), {
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
        batch.set(institutionDoc(institutionId, 'terms', termId), {
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
        await addDoc(institutionCollection(institutionId, 'nonSchoolDays'), {
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
        await addDoc(institutionCollection(institutionId, 'nonSchoolDays'), {
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

      // Remediation plan §5, row 2 — same reasoning as the draft-edit path
      // above: academicYears + terms + nonSchoolDays all written here,
      // none of it through FormModal.
      queryClient.invalidateQueries({ queryKey: ['academicYears', institutionId] });
      queryClient.invalidateQueries({ queryKey: ['terms', institutionId] });
      queryClient.invalidateQueries({ queryKey: ['nonSchoolDays', institutionId] });

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

      {/* ── Step 1: Year dates ── */}
      {step === 1 && (
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
      )}
    </div>
  );
}

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
function CustomTimeBlockWizard({ onDone }: { onDone: () => void }) {
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
    if (!name.trim()) { setError('Time block name is required.'); return; }
    if (!startDate) { setError('Start date is required.'); return; }
    if (durationMode === 'duration' && !(parsedDurationCount > 0)) {
      setError('Duration must be a positive number.');
      return;
    }
    if (!effectiveEndDate || effectiveEndDate <= startDate) {
      setError('End date must be after the start date.');
      return;
    }
    if (schoolWeekDays.length === 0) { setError('Select at least one session day.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const todayISO = now.slice(0, 10);
      const yearRef = doc(institutionCollection(institutionId, 'academicYears'));
      const termRef = doc(institutionCollection(institutionId, 'terms'));

      const batch = writeBatch(db);
      batch.set(yearRef, {
        institutionId,
        name: name.trim(),
        startDate,
        endDate: effectiveEndDate,
        status: 'active',
        schoolWeekDays,
        createdAt: serverTimestamp(),
        confirmedAt: now,
        confirmedBy: user.uid,
      });
      batch.set(termRef, {
        institutionId,
        academicYearId: yearRef.id,
        termNumber: 1,
        name: name.trim(),
        defaultName: name.trim(),
        startDate,
        endDate: effectiveEndDate,
        status: effectiveEndDate < todayISO ? 'completed' : startDate <= todayISO ? 'active' : 'upcoming',
      });
      await batch.commit();
      // Remediation plan §5, row 3 — academicYears + terms batch, bespoke
      // write outside FormModal.
      queryClient.invalidateQueries({ queryKey: ['academicYears', institutionId] });
      queryClient.invalidateQueries({ queryKey: ['terms', institutionId] });
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
function QuickTimeBlockModal({
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
    if (!name.trim()) { setError('Time block name is required.'); return; }
    if (!startDate) { setError('Start date is required.'); return; }
    if (!(parsedDurationCount > 0)) { setError('Duration must be a positive number.'); return; }
    if (!effectiveEndDate || effectiveEndDate <= startDate) {
      setError('End date must be after the start date.');
      return;
    }
    if (schoolWeekDays.length === 0) { setError('Select at least one session day.'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const todayISO = now.slice(0, 10);
      const yearRef = doc(institutionCollection(institutionId, 'academicYears'));
      const termRef = doc(institutionCollection(institutionId, 'terms'));

      const batch = writeBatch(db);
      batch.set(yearRef, {
        institutionId,
        name: name.trim(),
        startDate,
        endDate: effectiveEndDate,
        status: 'active',
        schoolWeekDays,
        createdAt: serverTimestamp(),
        confirmedAt: now,
        confirmedBy: user.uid,
      });
      batch.set(termRef, {
        institutionId,
        academicYearId: yearRef.id,
        termNumber: 1,
        name: name.trim(),
        defaultName: name.trim(),
        startDate,
        endDate: effectiveEndDate,
        status: effectiveEndDate < todayISO ? 'completed' : startDate <= todayISO ? 'active' : 'upcoming',
      });
      await batch.commit();
      // Remediation plan §5, row 4 — same reasoning as
      // CustomTimeBlockWizard.confirm() above.
      queryClient.invalidateQueries({ queryKey: ['academicYears', institutionId] });
      queryClient.invalidateQueries({ queryKey: ['terms', institutionId] });
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

// ─── Guard: does removing a day discard already-recorded attendance? ──────────
//
// Item 2 of EDIT_TIME_BLOCK_SCHOOL_WEEK_DAYS_REMEDIATION_PLAN.md §4.2.
// GeneralAttendanceDocument/subjectAttendance both store only a raw `date`
// string (no frozen "was this a valid school day" flag) — isSchoolDay() and
// isSubjectSessionDay() re-derive validity live from whatever
// schoolWeekDays currently is, so removing a day that already has
// attendance recorded on it would silently reinterpret history rather than
// just changing future behavior. Firestore can't query "day-of-week of a
// date string" server-side, so this reads every attendance doc for this
// time block and checks client-side — bounded by however many sessions
// this specific block has ever had (§4.2's read-cost note: fine at the
// "once-a-week, one programme" scale custom-mode institutions are built
// for, not a free-tier concern).
function computeRemovedDays(current: number[], next: number[]): number[] {
  return current.filter((d) => !next.includes(d));
}

async function findAttendanceOnRemovedDays(
  institutionId: string,
  yearId: string,
  removedDays: number[],
): Promise<{ day: number; exampleDate: string } | null> {
  const [general, subject] = await Promise.all([
    getDocs(
      query(institutionCollection(institutionId, 'generalAttendance'), where('academicYearId', '==', yearId)),
    ),
    getDocs(
      query(institutionCollection(institutionId, 'subjectAttendance'), where('academicYearId', '==', yearId)),
    ),
  ]);
  for (const snap of [general, subject]) {
    for (const d of snap.docs) {
      const date = d.data().date as string;
      const day = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (removedDays.includes(day)) return { day, exampleDate: date };
    }
  }
  return null;
}

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
function EditTimeBlockDaysModal({
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
      await updateDoc(institutionDoc(institutionId, 'academicYears', block.year.id), { schoolWeekDays });
      // Same 2-segment prefix invalidation convention as the caching
      // remediation plan's §5 — every consumer's cached academicYears read
      // (ClassForm, Attendance pages, the dashboards, CurrentTermContext,
      // ...) picks up the change without a reload.
      queryClient.invalidateQueries({ queryKey: ['academicYears', institutionId] });
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

// ─── Custom Time Blocks Summary (post-item-4/5 routing fix) ───────────────────
//
// activeYear/draftYear stay permanently null for calendarMode === 'custom'
// institutions (§3.1's deliberate singular/plural split) — without a
// dedicated branch, AcademicCalendarPage's existing "no active year and no
// draft → show the create wizard" check would be true forever, even after a
// time block already exists. Shows a read-only list of every active block,
// plus the quick-create trigger above. Per-block editing is limited to
// session days (EditTimeBlockDaysModal, above) — a full management view
// (editing name/dates, non-school days, etc. — the custom-mode equivalent
// of AcademicCalendarManagementView) remains out of scope.
function CustomTimeBlocksSummaryView({
  blocks,
  onCreateAnother,
  onEditBlock,
}: {
  blocks: ActiveTimeBlock[];
  onCreateAnother: () => void;
  onEditBlock: (block: ActiveTimeBlock) => void;
}) {
  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Time Blocks</h1>
        <button
          type="button"
          onClick={onCreateAnother}
          className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
        >
          + New Time Block
        </button>
      </div>
      <div className="flex flex-col gap-3 max-w-2xl">
        {blocks.map((b) => (
          <div
            key={b.term.id}
            className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{b.year.name}</p>
              <button
                type="button"
                onClick={() => onEditBlock(b)}
                title="Edit session days"
                aria-label="Edit session days"
                className="shrink-0 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {formatDate(b.year.startDate)} → {formatDate(b.year.endDate)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Draft Year Confirmation ───────────────────────────────────────────────────

function DraftYearConfirmation({
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
      const batch = writeBatch(db);
      // Activate the draft year
      batch.update(institutionDoc(draftYear.institutionId, 'academicYears', draftYear.id), {
        status: 'active',
        confirmedAt: new Date().toISOString(),
        confirmedBy: user.uid,
      });
      // Mark previous year completed
      if (previousYearId) {
        batch.update(institutionDoc(draftYear.institutionId, 'academicYears', previousYearId), { status: 'completed' });
      }
      await batch.commit();
      // Remediation plan §5, row 5 — academicYears-only batch (activation +
      // previous-year completion), bespoke write outside FormModal.
      queryClient.invalidateQueries({ queryKey: ['academicYears', draftYear.institutionId] });
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

// ─── Management View ───────────────────────────────────────────────────────────

function AcademicCalendarManagementView({
  activeYear,
  draftYear,
  terms: activeTerms,
  nonSchoolDays,
  onViewDraft,
}: {
  activeYear: AcademicYearDocument & { id: string };
  draftYear: (AcademicYearDocument & { id: string }) | null;
  terms: (TermDocument & { id: string })[];
  nonSchoolDays: (NonSchoolDayDocument & { id: string })[];
  onViewDraft: () => void;
}) {
  const { institutionId } = useAuth();
  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [termEdits, setTermEdits] = useState<Partial<TermDocument>>({});
  const [savingTerm, setSavingTerm] = useState(false);
  const [addingNSD, setAddingNSD] = useState(false);
  const [newNSD, setNewNSD] = useState<Omit<CustomNSD, 'id'>>({ type: 'single', date: '', startDate: '', endDate: '', reason: '' });
  const [nsdError, setNsdError] = useState<string | null>(null);
  const [allNonSchoolDays, setAllNonSchoolDays] = useState<(NonSchoolDayDocument & { id: string })[]>(nonSchoolDays);

  useEffect(() => {
    if (!institutionId || institutionId === '*') return;
    return onSnapshot(
      query(
        institutionCollection(institutionId, 'nonSchoolDays'),
        where('academicYearId', '==', activeYear.id),
      ),
      (snap) =>
        setAllNonSchoolDays(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as NonSchoolDayDocument & { id: string })),
        ),
    );
  }, [institutionId, activeYear.id]);

  async function saveTerm(termId: string) {
    if (!institutionId || institutionId === '*') return;
    setSavingTerm(true);
    try {
      await updateDoc(institutionDoc(institutionId, 'terms', termId), termEdits);
      // Remediation plan §5, row 6.
      queryClient.invalidateQueries({ queryKey: ['terms', institutionId] });
      setEditingTermId(null);
      setTermEdits({});
    } catch {
      // show no-op error inline if needed
    } finally {
      setSavingTerm(false);
    }
  }

  async function toggleNSD(nsd: NonSchoolDayDocument & { id: string }) {
    await updateDoc(institutionDoc(nsd.institutionId, 'nonSchoolDays', nsd.id), { isActive: !nsd.isActive });
    // Remediation plan §5, row 7.
    queryClient.invalidateQueries({ queryKey: ['nonSchoolDays', nsd.institutionId] });
  }

  async function addNSD() {
    if (!institutionId) return;
    if (!newNSD.reason.trim()) { setNsdError('Reason is required.'); return; }
    if (newNSD.type === 'single' && !newNSD.date) { setNsdError('Date is required.'); return; }
    if (newNSD.type === 'range' && (!newNSD.startDate || !newNSD.endDate)) { setNsdError('Start and end dates are required.'); return; }
    setNsdError(null);
    await addDoc(institutionCollection(institutionId, 'nonSchoolDays'), {
      institutionId,
      academicYearId: activeYear.id,
      type: newNSD.type,
      ...(newNSD.type === 'single' ? { date: newNSD.date } : { startDate: newNSD.startDate, endDate: newNSD.endDate }),
      reason: newNSD.reason,
      source: 'institution_specific',
      isActive: true,
      createdAt: serverTimestamp(),
    });
    // Remediation plan §5, row 8.
    queryClient.invalidateQueries({ queryKey: ['nonSchoolDays', institutionId] });
    setAddingNSD(false);
    setNewNSD({ type: 'single', date: '', startDate: '', endDate: '', reason: '' });
  }

  const today = new Date().toISOString().slice(0, 10);
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
          <button
            id="tour-academic-calendar-draft-pending"
            type="button"
            onClick={onViewDraft}
            className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md px-3 py-1.5"
          >
            {draftYear.name} pending →
          </button>
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
                      id="tour-academic-calendar-term-edit-name"
                      value={termEdits.name ?? t.name}
                      onChange={(v) => setTermEdits((prev) => ({ ...prev, name: v }))}
                      maxLength={80}
                    />
                  </Label>
                  <Label>
                    Start date
                    <DateInput
                      id="tour-academic-calendar-term-edit-start"
                      value={(termEdits.startDate ?? t.startDate) as string}
                      onChange={(v) => setTermEdits((prev) => ({ ...prev, startDate: v }))}
                    />
                  </Label>
                  <Label>
                    End date
                    <DateInput
                      id="tour-academic-calendar-term-edit-end"
                      value={(termEdits.endDate ?? t.endDate) as string}
                      onChange={(v) => setTermEdits((prev) => ({ ...prev, endDate: v }))}
                    />
                  </Label>
                  <div className="sm:col-span-3 flex gap-2 mt-1">
                    <button id="tour-academic-calendar-term-edit-save" type="button" onClick={() => saveTerm(t.id)} disabled={savingTerm} className="text-xs font-medium text-sky-600 hover:underline disabled:text-gray-400">
                      {savingTerm ? 'Saving…' : 'Save'}
                    </button>
                    <button id="tour-academic-calendar-term-edit-cancel" type="button" onClick={() => { setEditingTermId(null); setTermEdits({}); }} className="text-xs text-gray-500 hover:underline">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t.name}</p>
                      {today >= (t.startDate as string) && today <= (t.endDate as string) && (
                        <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(t.startDate)} → {formatDate(t.endDate)}</p>
                  </div>
                  <button
                    id={`tour-academic-calendar-term-${t.termNumber}-edit`}
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
          <button id="tour-academic-calendar-nsd-add" type="button" onClick={() => setAddingNSD(true)} className="text-xs text-sky-600 hover:underline">
            + Add
          </button>
        </div>

        {addingNSD && (
          <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-md p-4 space-y-3">
            <div className="flex gap-2">
              {(['single', 'range'] as const).map((t) => (
                <button
                  key={t}
                  id={`tour-academic-calendar-nsd-new-type-${t}`}
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
                <Label>Date<DateInput id="tour-academic-calendar-nsd-new-date" value={newNSD.date} onChange={(v) => setNewNSD((p) => ({ ...p, date: v }))} /></Label>
              ) : (
                <>
                  <Label>Start<DateInput id="tour-academic-calendar-nsd-new-start" value={newNSD.startDate} onChange={(v) => setNewNSD((p) => ({ ...p, startDate: v }))} /></Label>
                  <Label>End<DateInput id="tour-academic-calendar-nsd-new-end" value={newNSD.endDate} onChange={(v) => setNewNSD((p) => ({ ...p, endDate: v }))} /></Label>
                </>
              )}
              <Label>
                Reason (max 100 chars)
                <TextInput id="tour-academic-calendar-nsd-new-reason" value={newNSD.reason} onChange={(v) => setNewNSD((p) => ({ ...p, reason: v.slice(0, 100) }))} placeholder="e.g. School sports day" maxLength={100} />
              </Label>
            </div>
            {nsdError && <p className="text-xs text-red-500">{nsdError}</p>}
            <div className="flex gap-2">
              <button id="tour-academic-calendar-nsd-new-save" type="button" onClick={addNSD} className="text-xs font-medium text-sky-600 hover:underline">Save</button>
              <button id="tour-academic-calendar-nsd-new-cancel" type="button" onClick={() => setAddingNSD(false)} className="text-xs text-gray-500 hover:underline">Cancel</button>
            </div>
          </div>
        )}

        {(() => {
          const publicHolidays = allNonSchoolDays.filter((n) => n.source === 'public_holiday');
          const otherDates = allNonSchoolDays.filter((n) => n.source !== 'public_holiday');

          const renderNSDCard = (n: NonSchoolDayDocument & { id: string }) => (
            <div key={n.id} className={`flex items-center justify-between rounded-md border px-3 py-2 ${n.isActive ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-60'}`}>
              <div>
                <span className="text-sm text-gray-900 dark:text-gray-100">{n.reason}</span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  {n.type === 'single' ? formatDate(n.date ?? '') : `${formatDate(n.startDate ?? '')} → ${formatDate(n.endDate ?? '')}`}
                </span>
              </div>
              <button
                id={`tour-academic-calendar-nsd-toggle-${n.id}`}
                type="button"
                onClick={() => toggleNSD(n)}
                className="text-xs text-sky-600 hover:underline ml-3 shrink-0"
              >
                {n.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          );

          return (
            <>
              <div className="space-y-1 mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Public Holidays</h3>
                {publicHolidays.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">No public holidays configured.</p>
                ) : (
                  <div className="space-y-2">{publicHolidays.map(renderNSDCard)}</div>
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Other Dates</h3>
                {otherDates.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500">No other dates configured.</p>
                ) : (
                  <div className="space-y-2">{otherDates.map(renderNSDCard)}</div>
                )}
              </div>
            </>
          );
        })()}
      </section>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AcademicCalendarPage() {
  const { user, institutionId, institution } = useAuth();
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
    if (USE_MOCK || !activeYear || draftYear || !user || !institutionId || institution?.calendarMode === 'custom') return;
    const today = new Date().toISOString().slice(0, 10);
    if (today <= activeYear.endDate) return;

    const nextStart = addOneYear(activeYear.startDate);
    const nextEnd   = addOneYear(activeYear.endDate);
    const nextName  = buildYearName(nextStart, nextEnd);

    addDoc(institutionCollection(institutionId, 'academicYears'), {
      institutionId,
      name: nextName,
      startDate: nextStart,
      endDate: nextEnd,
      status: 'draft',
      schoolWeekDays: activeYear.schoolWeekDays,
      createdAt: serverTimestamp(),
    })
      // Remediation plan §5, row 9.
      .then(() => queryClient.invalidateQueries({ queryKey: ['academicYears', institutionId] }))
      .catch(() => {});
  }, [activeYear, draftYear, user, institutionId, institution]);

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
      return <CustomTimeBlockWizard onDone={() => {}} />;
    }
    return (
      <>
        <CustomTimeBlocksSummaryView
          blocks={activeTimeBlocks}
          onCreateAnother={() => setCreatingAnotherBlock(true)}
          onEditBlock={setEditingBlock}
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
