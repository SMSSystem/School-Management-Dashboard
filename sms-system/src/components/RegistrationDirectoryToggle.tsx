import { useEffect, useState } from 'react';
import { doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { onLoadError } from '@/lib/reportError';
import { institutionCollection } from '@/lib/paths';
import type { RegistrationDirectoryEntry } from '@/lib/firebase';

type ActiveYear = { id: string; name: string };
type OpenTimeBlock = { academicYearId: string; name: string; startDate: string; endDate: string };

// Order-independent comparison — used only to decide whether the directory
// entry's openTimeBlocks is stale, so field order/array order don't matter.
function sameOpenBlocks(a: OpenTimeBlock[], b: OpenTimeBlock[]): boolean {
  if (a.length !== b.length) return false;
  const key = (x: OpenTimeBlock) => `${x.academicYearId}|${x.name}|${x.startDate}|${x.endDate}`;
  const aKeys = new Set(a.map(key));
  return b.every((x) => aKeys.has(key(x)));
}

export default function RegistrationDirectoryToggle() {
  const { user, institutionId, institution } = useAuth();
  const isCustomMode = institution?.calendarMode === 'custom';
  const [activeYear, setActiveYear] = useState<ActiveYear | null>(null);
  const [openBlocks, setOpenBlocks] = useState<OpenTimeBlock[]>([]);
  const [checkingYear, setCheckingYear] = useState(true);
  const [entry, setEntry] = useState<RegistrationDirectoryEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasActiveCalendar = isCustomMode ? openBlocks.length > 0 : !!activeYear;

  // Find the institution's active academic year(s) — this is the signed-in
  // admin's own read, fully permitted by the existing institutions/{id}/
  // academicYears rule (isSignedIn() && inMyInstitution()). Custom-mode
  // institutions can have several simultaneously active (§2, §3) — there's
  // no "the" active year to single out the way academic-mode always has.
  useEffect(() => {
    if (!institutionId || institutionId === '*') return;
    setCheckingYear(true);
    getDocs(
      query(institutionCollection(institutionId, 'academicYears'), where('status', '==', 'active')),
    ).then((snap) => {
      if (isCustomMode) {
        setOpenBlocks(
          snap.docs.map((d) => ({
            academicYearId: d.id,
            name: (d.data().name as string) ?? d.id,
            startDate: d.data().startDate as string,
            endDate: d.data().endDate as string,
          })),
        );
        setActiveYear(null);
      } else {
        const d = snap.docs[0];
        setActiveYear(d ? { id: d.id, name: (d.data().name as string) ?? d.id } : null);
        setOpenBlocks([]);
      }
      setCheckingYear(false);
    }, onLoadError('the active academic year', () => setCheckingYear(false)));
  }, [institutionId, isCustomMode]);

  // Load the current directory entry, if one exists.
  useEffect(() => {
    if (!institutionId || institutionId === '*') return;
    getDoc(doc(db, 'registration_directory', institutionId)).then((snap) => {
      setEntry(snap.exists() ? (snap.data() as RegistrationDirectoryEntry) : null);
    }, onLoadError('the registration settings'));
  }, [institutionId]);

  // Keep-fresh: if the directory is already accepting registrations and the
  // active calendar data has since changed (or the institution's name/logo
  // changed), silently re-sync on every visit to this settings section —
  // closes the staleness gap a stale registration_directory entry would
  // otherwise create without needing a Cloud Function trigger.
  useEffect(() => {
    if (!institutionId || institutionId === '*' || !user || !institution) return;
    if (!entry?.acceptingRegistrations || !hasActiveCalendar) return;
    // Both sides normalized to the same null sentinel — matching what's
    // actually written below (logoUrl: institution.logoUrl ?? null).
    // entry.logoUrl is typed string | undefined, but a document written by
    // this component always stores it as null when absent, so comparing it
    // as-is against (institution.logoUrl ?? undefined) compared null against
    // undefined and was always unequal, making "stale" always true for any
    // institution with no logo (STUDENT_REGISTRATION_FORM_CODE_REVIEW_FINDINGS.md #8).
    const baseStale =
      entry.name !== institution.name ||
      (entry.logoUrl ?? null) !== (institution.logoUrl ?? null);
    const stale = isCustomMode
      ? baseStale || !sameOpenBlocks(entry.openTimeBlocks ?? [], openBlocks)
      : baseStale || entry.activeAcademicYearId !== activeYear!.id;
    if (!stale) return;
    setDoc(
      doc(db, 'registration_directory', institutionId),
      {
        name: institution.name,
        logoUrl: institution.logoUrl ?? null,
        acceptingRegistrations: true,
        ...(isCustomMode
          ? { openTimeBlocks: openBlocks }
          : { activeAcademicYearId: activeYear!.id, activeAcademicYearName: activeYear!.name }),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true },
    );
  }, [entry, activeYear, openBlocks, isCustomMode, hasActiveCalendar, institution, institutionId, user]);

  const isChecked = entry?.acceptingRegistrations ?? false;

  const toggle = async (next: boolean) => {
    if (!institutionId || institutionId === '*' || !user) return;
    setError(null);
    if (next && !hasActiveCalendar) {
      setError(
        isCustomMode
          ? 'Set up at least one active Time Block on the Academic Calendar page before accepting registrations.'
          : 'Set an active academic year on the Academic Calendar page before accepting registrations.',
      );
      return;
    }
    setSaving(true);
    try {
      await setDoc(
        doc(db, 'registration_directory', institutionId),
        {
          name: institution?.name ?? '',
          logoUrl: institution?.logoUrl ?? null,
          acceptingRegistrations: next,
          ...(next && hasActiveCalendar
            ? isCustomMode
              ? { openTimeBlocks: openBlocks }
              : { activeAcademicYearId: activeYear!.id, activeAcademicYearName: activeYear!.name }
            : {}),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true },
      );
      setEntry((prev) => ({ ...(prev ?? ({} as RegistrationDirectoryEntry)), acceptingRegistrations: next }));
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 sm:p-6 mt-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Student Registration</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        When enabled, your institution appears on the public registration page and prospective families can
        submit a registration form for review.
      </p>

      <label className="flex items-center gap-3 mt-4 cursor-pointer">
        <input
          type="checkbox"
          checked={isChecked}
          // Greyed out only when there's no active calendar data AND the
          // toggle is currently off — turning an already-active toggle back
          // off must always stay available, even if that data later disappears.
          disabled={saving || checkingYear || (!hasActiveCalendar && !isChecked)}
          onChange={(e) => toggle(e.target.checked)}
          className="accent-sky-500 w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Accept new student registrations
        </span>
      </label>

      {!checkingYear && !hasActiveCalendar && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          {isCustomMode
            ? 'No active Time Block found. Set one up on the Academic Calendar page first.'
            : 'No active academic year found. Set one on the Academic Calendar page first.'}
        </p>
      )}
      {isCustomMode && openBlocks.length > 0 && (
        <p className="mt-2 text-xs text-gray-400">
          Applicants will be able to choose from {openBlocks.length} open time block{openBlocks.length === 1 ? '' : 's'}:{' '}
          {openBlocks.map((b) => b.name).join(', ')}.
        </p>
      )}
      {!isCustomMode && activeYear && (
        <p className="mt-2 text-xs text-gray-400">Registrations will be filed under {activeYear.name}.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
