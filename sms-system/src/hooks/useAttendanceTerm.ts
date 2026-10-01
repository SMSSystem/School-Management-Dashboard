import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { useInstitutionClasses } from '@/hooks/useInstitutionClasses';
import { resolveAttendanceTerm, type AttendanceTerm } from '@/lib/attendanceTerm';

// The term a student's (or a parent's child's) attendance is read for — works in
// both calendar modes. See lib/attendanceTerm.ts for the resolution rule. The
// classes query is the shared, cached reference-data one, so this adds no read
// beyond what the calendar hook and class list already do.
export function useAttendanceTerm(classId: string | null | undefined): {
  term: AttendanceTerm | null;
  blocks: AttendanceTerm[];
  needsPicker: boolean;
  selectedTermId: string | null;
  setSelectedTermId: (id: string) => void;
  loading: boolean;
  timedOut: boolean;
} {
  const { institution } = useAuth();
  const { activeTerm, activeTimeBlocks, loading: calLoading, timedOut } = useInstitutionAcademicCalendar();
  const { data: classes, isLoading: classesLoading } = useInstitutionClasses();
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);

  const isCustomMode = institution?.calendarMode === 'custom';
  const classTermId = classes?.find((c) => c.id === classId)?.termId ?? null;

  const { term, needsPicker } = useMemo(
    () =>
      resolveAttendanceTerm({
        isCustomMode,
        activeTerm,
        activeTimeBlocks,
        classTermId,
        selectedTermId,
      }),
    [isCustomMode, activeTerm, activeTimeBlocks, classTermId, selectedTermId],
  );

  return {
    term,
    blocks: activeTimeBlocks.map((b) => b.term),
    needsPicker,
    selectedTermId: term?.id ?? null,
    setSelectedTermId,
    // A custom-mode class's block can't be known until the classes have loaded.
    loading: calLoading || (isCustomMode && !!classId && classesLoading),
    timedOut,
  };
}
