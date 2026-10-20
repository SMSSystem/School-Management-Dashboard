import { useEffect, useState } from 'react';
import { onSnapshot, query, where } from 'firebase/firestore';
import type { AcademicYearDocument, TermDocument, NonSchoolDayDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { onLoadError } from '@/lib/reportError';
import { canManage } from '@/lib/roleCapabilities';
import { institutionCollection } from '@/lib/paths';
import { addNonSchoolDay, saveTermEdits, toggleNonSchoolDay } from '@/lib/academicCalendarSave';
import { formatDate, validateNewNonSchoolDay, type CustomNSD } from '@/lib/academicCalendarLogic';
import { TermsSection } from './TermsSection';
import { NonSchoolDaysSection } from './NonSchoolDaysSection';

// ─── Management View ───────────────────────────────────────────────────────────

export function AcademicCalendarManagementView({
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
  const { institutionId, role } = useAuth();
  // A spectator sees the terms and non-school days but cannot change them.
  const mayEdit = canManage(role);
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
      onLoadError('non-school days'),
    );
  }, [institutionId, activeYear.id]);

  async function saveTerm(termId: string) {
    if (!institutionId || institutionId === '*') return;
    setSavingTerm(true);
    try {
      await saveTermEdits(institutionId, termId, termEdits);
      setEditingTermId(null);
      setTermEdits({});
    } catch {
      // show no-op error inline if needed
    } finally {
      setSavingTerm(false);
    }
  }

  async function toggleNSD(nsd: NonSchoolDayDocument & { id: string }) {
    await toggleNonSchoolDay(nsd);
  }

  async function addNSD() {
    if (!institutionId) return;
    const invalid = validateNewNonSchoolDay(newNSD);
    if (invalid) { setNsdError(invalid); return; }
    setNsdError(null);
    await addNonSchoolDay(institutionId, activeYear.id, newNSD);
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
        {mayEdit && draftYear && (
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
      <TermsSection
        sortedTerms={sortedTerms}
        editingTermId={editingTermId}
        setEditingTermId={setEditingTermId}
        termEdits={termEdits}
        setTermEdits={setTermEdits}
        savingTerm={savingTerm}
        saveTerm={saveTerm}
        today={today}
        mayEdit={mayEdit}
      />

      {/* Non-school days */}
      <NonSchoolDaysSection
        mayEdit={mayEdit}
        addingNSD={addingNSD}
        setAddingNSD={setAddingNSD}
        newNSD={newNSD}
        setNewNSD={setNewNSD}
        nsdError={nsdError}
        addNSD={addNSD}
        allNonSchoolDays={allNonSchoolDays}
        toggleNSD={toggleNSD}
      />
    </div>
  );
}
