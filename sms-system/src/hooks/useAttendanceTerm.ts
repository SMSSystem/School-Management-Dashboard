import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { institutionDoc } from '@/lib/paths';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { resolveAttendanceTerm, type AttendanceTerm } from '@/lib/attendanceTerm';
import { REFERENCE_STALE_MS } from '@/lib/queryPolicies';

// The term a student's (or a parent's child's) attendance is read for — works in
// both calendar modes. See lib/attendanceTerm.ts for the resolution rule.
//
// Free-tier note: the class's own termId is only needed in custom-calendar mode
// (academic mode has one active term), so the class is fetched as ONE document,
// and only then — not the whole classes collection, which would cost a read per
// class on every visit.
export function useAttendanceTerm(classId: string | null | undefined): {
  term: AttendanceTerm | null;
  blocks: AttendanceTerm[];
  needsPicker: boolean;
  selectedTermId: string | null;
  setSelectedTermId: (id: string) => void;
  loading: boolean;
  timedOut: boolean;
} {
  const { institution, institutionId } = useAuth();
  const { activeTerm, activeTimeBlocks, loading: calLoading, timedOut } = useInstitutionAcademicCalendar();
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);

  const isCustomMode = institution?.calendarMode === 'custom';
  const classEnabled =
    DATA_MODE === 'live' && isCustomMode && !!classId && !!institutionId && institutionId !== '*';

  const classQuery = useQuery({
    queryKey: ['class', institutionId, classId],
    queryFn: async (): Promise<string | null> => {
      const snap = await getDoc(institutionDoc(institutionId!, 'classes', classId!));
      return (snap.data()?.termId as string | undefined) ?? null;
    },
    enabled: classEnabled,
    staleTime: REFERENCE_STALE_MS,
  });
  const classTermId = classQuery.data ?? null;

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
    // A custom-mode class's block can't be known until its document has loaded.
    loading: calLoading || (classEnabled && classQuery.isLoading),
    timedOut,
  };
}
