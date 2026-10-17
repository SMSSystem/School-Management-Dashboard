import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { useSeniorTeacherProfile } from '@/hooks/useSeniorTeacherProfile';
import { useInstitutionClasses } from '@/hooks/useInstitutionClasses';
import { getPersistedFilter, setPersistedFilter } from '@/lib/filterPersistence';

const FILTER_PAGE = 'general_attendance';

// Which class, time block, academic year and term the General Attendance Register is showing: the
// admin's pickers (restored from the last selection this session), a senior teacher's homeroom class and
// the one time block it belongs to, and the term's non-school days.
export function useGeneralAttendanceScope() {
  const { role, institution } = useAuth();
  const {
    activeYear, activeTerm, nonSchoolDays,
    activeTimeBlocks, nonSchoolDaysByTermId,
    loading: calLoading, timedOut: calTimedOut,
  } = useInstitutionAcademicCalendar();
  const { assignedClassId, assignedClassName, loading: profileLoading } = useSeniorTeacherProfile();
  const isCustomMode = institution?.calendarMode === 'custom';

  // Class selector (admin/super_admin) — initial value restored from the last
  // selection made this session (cleared on logout), per DEV_NOTES Item 6.1.
  const { data: classes = [] } = useInstitutionClasses();

  // ── Time Block selector (§3.2, custom-mode admin/super_admin path only) ──
  // A senior_teacher's assigned class already ties them to exactly one time
  // block via the class's own termId — no picker needed for that role; see
  // resolvedBlock below. For admin/super_admin, this scopes which classes the
  // class selector below even shows, since classes across concurrently active
  // time blocks would otherwise be shown all mixed together.
  const [selectedBlockTermId, setSelectedBlockTermId] = useState<string>(() => getPersistedFilter(FILTER_PAGE, 'selectedBlockTermId'));
  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, 'selectedBlockTermId', selectedBlockTermId);
  }, [selectedBlockTermId]);
  // Falls back to activeTimeBlocks[0] (the confirmed default-selection rule,
  // §3 — the hook already returns this list pre-sorted) rather than a
  // separate "default it" effect, so there's no render where a valid block
  // list exists but nothing is selected yet.
  const persistedBlockValid = activeTimeBlocks.some((b) => b.term.id === selectedBlockTermId);
  const selectedBlock = persistedBlockValid
    ? activeTimeBlocks.find((b) => b.term.id === selectedBlockTermId)!
    : activeTimeBlocks[0] ?? null;

  const scopedClasses = isCustomMode && role !== 'senior_teacher'
    ? classes.filter((c) => c.termId === selectedBlock?.term.id)
    : classes;

  const [selectedClassId, setSelectedClassId] = useState<string>(() => getPersistedFilter(FILTER_PAGE, 'selectedClassId'));
  const selectedClass = scopedClasses.find((c) => c.id === selectedClassId);

  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, 'selectedClassId', selectedClassId);
  }, [selectedClassId]);

  // Drop a restored classId once classes have loaded and it's no longer valid
  // (e.g. the class was deleted since the last session, or — custom mode —
  // it belongs to a different time block than the one now selected above).
  useEffect(() => {
    if (selectedClassId && scopedClasses.length > 0 && !scopedClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId('');
    }
  }, [selectedClassId, scopedClasses]);

  // A senior_teacher's own time block, resolved from their assigned class's
  // termId rather than any picker — always exactly one, unambiguous.
  const assignedClassDoc = role === 'senior_teacher' ? classes.find((c) => c.id === assignedClassId) : undefined;
  const resolvedBlock = !isCustomMode
    ? null
    : role === 'senior_teacher'
    ? activeTimeBlocks.find((b) => b.term.id === assignedClassDoc?.termId) ?? null
    : selectedBlock;

  const effectiveYear = isCustomMode ? resolvedBlock?.year ?? null : activeYear;
  const effectiveTerm = isCustomMode ? resolvedBlock?.term ?? null : activeTerm;
  // Memoized (not a bare fallback-to-[] expression) so its identity is stable
  // whenever the underlying data doesn't change — otherwise the `[]` fallback
  // below would be a fresh array every render, and schoolDays' own useMemo
  // (keyed on this) would never actually memoize anything for custom mode.
  const effectiveNonSchoolDays = useMemo(
    () => (isCustomMode ? (effectiveTerm ? nonSchoolDaysByTermId[effectiveTerm.id] ?? [] : []) : nonSchoolDays),
    [isCustomMode, effectiveTerm, nonSchoolDaysByTermId, nonSchoolDays],
  );

  // ── Set effective class ID ──
  const effectiveClassId = role === 'senior_teacher' ? (assignedClassId ?? '') : selectedClassId;
  const effectiveClassName =
    role === 'senior_teacher'
      ? (assignedClassName ?? '')
      : (selectedClass?.name ?? '');

  return {
    isCustomMode,
    activeTimeBlocks,
    selectedBlock,
    setSelectedBlockTermId,
    resolvedBlock,
    scopedClasses,
    selectedClassId,
    setSelectedClassId,
    assignedClassId,
    effectiveYear,
    effectiveTerm,
    effectiveNonSchoolDays,
    effectiveClassId,
    effectiveClassName,
    calLoading,
    calTimedOut,
    profileLoading,
  };
}
