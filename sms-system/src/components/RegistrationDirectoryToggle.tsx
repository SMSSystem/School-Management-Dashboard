import { useEffect, useState } from 'react';
import { doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { institutionCollection } from '@/lib/paths';
import type { RegistrationDirectoryEntry } from '@/lib/firebase';

type ActiveYear = { id: string; name: string };

export default function RegistrationDirectoryToggle() {
  const { user, institutionId, institution } = useAuth();
  const [activeYear, setActiveYear] = useState<ActiveYear | null>(null);
  const [checkingYear, setCheckingYear] = useState(true);
  const [entry, setEntry] = useState<RegistrationDirectoryEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find the institution's current active academic year — this is the
  // signed-in admin's own read, fully permitted by the existing
  // institutions/{id}/academicYears rule (isSignedIn() && inMyInstitution()).
  useEffect(() => {
    if (!institutionId || institutionId === '*') return;
    setCheckingYear(true);
    getDocs(
      query(institutionCollection(institutionId, 'academicYears'), where('status', '==', 'active')),
    ).then((snap) => {
      const d = snap.docs[0];
      setActiveYear(d ? { id: d.id, name: (d.data().name as string) ?? d.id } : null);
      setCheckingYear(false);
    });
  }, [institutionId]);

  // Load the current directory entry, if one exists.
  useEffect(() => {
    if (!institutionId || institutionId === '*') return;
    getDoc(doc(db, 'registration_directory', institutionId)).then((snap) => {
      setEntry(snap.exists() ? (snap.data() as RegistrationDirectoryEntry) : null);
    });
  }, [institutionId]);

  // Keep-fresh: if the directory is already accepting registrations and the
  // active year has since changed (or the institution's name/logo changed),
  // silently re-sync on every visit to this settings section — closes the
  // staleness gap a stale registration_directory entry would otherwise create
  // without needing a Cloud Function trigger.
  useEffect(() => {
    if (!institutionId || institutionId === '*' || !user || !institution) return;
    if (!entry?.acceptingRegistrations || !activeYear) return;
    const stale =
      entry.activeAcademicYearId !== activeYear.id ||
      entry.name !== institution.name ||
      entry.logoUrl !== (institution.logoUrl ?? undefined);
    if (!stale) return;
    setDoc(
      doc(db, 'registration_directory', institutionId),
      {
        name: institution.name,
        logoUrl: institution.logoUrl ?? null,
        acceptingRegistrations: true,
        activeAcademicYearId: activeYear.id,
        activeAcademicYearName: activeYear.name,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true },
    );
  }, [entry, activeYear, institution, institutionId, user]);

  const isChecked = entry?.acceptingRegistrations ?? false;

  const toggle = async (next: boolean) => {
    if (!institutionId || institutionId === '*' || !user) return;
    setError(null);
    if (next && !activeYear) {
      setError('Set an active academic year on the Academic Calendar page before accepting registrations.');
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
          ...(next && activeYear
            ? { activeAcademicYearId: activeYear.id, activeAcademicYearName: activeYear.name }
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
          // Greyed out only when there's no active year AND the toggle is
          // currently off — turning an already-active toggle back off must
          // always stay available, even if the active year later disappears.
          disabled={saving || checkingYear || (!activeYear && !isChecked)}
          onChange={(e) => toggle(e.target.checked)}
          className="accent-sky-500 w-4 h-4 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Accept new student registrations
        </span>
      </label>

      {!checkingYear && !activeYear && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          No active academic year found. Set one on the Academic Calendar page first.
        </p>
      )}
      {activeYear && (
        <p className="mt-2 text-xs text-gray-400">Registrations will be filed under {activeYear.name}.</p>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
