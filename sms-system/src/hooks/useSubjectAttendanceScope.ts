import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { useInstitutionClasses } from '@/hooks/useInstitutionClasses';
import { useInstitutionSubjects } from '@/hooks/useInstitutionSubjects';
import { getPersistedFilter, setPersistedFilter } from '@/lib/filterPersistence';
import { classesForSubjectDropdown, needsClassSelector } from '@/lib/subjectAttendanceLogic';

const FILTER_PAGE = 'subject_attendance';

// What the Subject Attendance Register page (scenes/(dashboard)/attendance/subject) is looking at: the subject,
// class and (custom calendar mode) time block chosen, remembered for the session, and the academic year, term
// and non-school days that follow from them. Moved from the page as it was.
export function useSubjectAttendanceScope() {
  const { institution } = useAuth();
  const {
    activeYear, activeTerm, nonSchoolDays,
    activeTimeBlocks, nonSchoolDaysByTermId,
    loading: calLoading, timedOut: calTimedOut,
  } = useInstitutionAcademicCalendar();
  const isCustomMode = institution?.calendarMode === 'custom';

  // Subject list — selection restored from the last selection made this
  // session (cleared on logout), per DEV_NOTES Item 6.1.
  const { data: rawSubjects = [] } = useInstitutionSubjects();
  const subjects = useMemo(
    () => [...rawSubjects].sort((a, b) => a.name.localeCompare(b.name)),
    [rawSubjects],
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState(() => getPersistedFilter(FILTER_PAGE, 'selectedSubjectId'));
  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) ?? null;

  // All institution classes (used for institution-scoped subjects and the class dropdown)
  const { data: rawAllClasses = [] } = useInstitutionClasses();
  const allClasses = useMemo(
    () => [...rawAllClasses].sort((a, b) => a.name.localeCompare(b.name)),
    [rawAllClasses],
  );
  const [selectedClassId, setSelectedClassId] = useState(() => getPersistedFilter(FILTER_PAGE, 'selectedClassId'));
  const selectedClassName = allClasses.find((c) => c.id === selectedClassId)?.name ?? '';

  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, 'selectedSubjectId', selectedSubjectId);
  }, [selectedSubjectId]);

  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, 'selectedClassId', selectedClassId);
  }, [selectedClassId]);

  // ── Time Block selector (§3.2, custom-mode only) — scopes classesForDropdown
  // below. Falls back to activeTimeBlocks[0] (the confirmed default-selection
  // rule, §3 — the hook already returns this list pre-sorted) rather than a
  // separate "default it" effect, so there's no render where a valid block
  // list exists but nothing is selected yet. Deliberately doesn't also try to
  // follow whichever class ends up selected (unlike General Attendance's
  // senior_teacher case) — subjects aren't themselves time-block-scoped, so
  // there's no single unambiguous class to derive a fallback from here, and
  // the dropdown is always visible for the admin to correct manually.
  const [selectedBlockTermId, setSelectedBlockTermId] = useState(() => getPersistedFilter(FILTER_PAGE, 'selectedBlockTermId'));
  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, 'selectedBlockTermId', selectedBlockTermId);
  }, [selectedBlockTermId]);
  const persistedBlockValid = activeTimeBlocks.some((b) => b.term.id === selectedBlockTermId);
  const selectedBlock = persistedBlockValid
    ? activeTimeBlocks.find((b) => b.term.id === selectedBlockTermId)!
    : activeTimeBlocks[0] ?? null;

  const effectiveYear = isCustomMode ? selectedBlock?.year ?? null : activeYear;
  const effectiveTerm = isCustomMode ? selectedBlock?.term ?? null : activeTerm;
  const effectiveNonSchoolDays = isCustomMode
    ? (effectiveTerm ? nonSchoolDaysByTermId[effectiveTerm.id] ?? [] : [])
    : nonSchoolDays;

  // ── Auto-select class when subject scope is 'class' with exactly one class;
  // otherwise keep a still-valid selection (including one restored from a
  // persisted filter) and clear only once it's confirmed invalid — per
  // DEV_NOTES Item 6.1. subjects.length gates against clearing before subjects
  // have loaded (selectedSubject briefly resolves to null pre-load even when
  // selectedSubjectId is already set, e.g. right after a persisted restore). ──
  useEffect(() => {
    if (!selectedSubjectId) { setSelectedClassId(''); return; }
    if (subjects.length === 0) return;
    if (!selectedSubject) { setSelectedClassId(''); return; }
    if (selectedSubject.classScope === 'class') {
      if (selectedSubject.classIds.length === 1) {
        setSelectedClassId(selectedSubject.classIds[0]);
      } else {
        setSelectedClassId((prev) => (selectedSubject.classIds.includes(prev) ? prev : ''));
      }
    } else {
      // Institution-scoped: any class in allClasses is valid. allClasses.length === 0
      // means classes haven't loaded yet — keep the current value rather than guess,
      // and rely on allClasses being a dependency below to re-run this check once
      // the real class list arrives (otherwise a stale/deleted classId persisted
      // from a previous session would never get revalidated).
      setSelectedClassId((prev) => (allClasses.length === 0 || allClasses.some((c) => c.id === prev) ? prev : ''));
    }
  }, [selectedSubjectId, subjects.length, selectedSubject, allClasses]);

  // Custom mode: further scoped to the selected time block, since a
  // subject's own classIds/classScope aren't themselves time-block-aware,
  // but every class carries its own termId (§3.2).
  const classesForDropdown = classesForSubjectDropdown(selectedSubject, allClasses, isCustomMode, selectedBlock);

  const showClassSelector = needsClassSelector(selectedSubject);

  return {
    isCustomMode,
    calLoading,
    calTimedOut,
    activeTimeBlocks,
    subjects,
    selectedSubjectId,
    setSelectedSubjectId,
    selectedSubject,
    selectedClassId,
    setSelectedClassId,
    selectedClassName,
    selectedBlock,
    setSelectedBlockTermId,
    effectiveYear,
    effectiveTerm,
    effectiveNonSchoolDays,
    classesForDropdown,
    showClassSelector,
  };
}
