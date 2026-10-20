import { useQueries, useQuery } from '@tanstack/react-query';
import { getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { institutionCollection } from '@/lib/paths';
import { useAllInstitutionSubjects } from '@/hooks/useInstitutionSubjects';
import {
  buildDayRows,
  buildSubjectItems,
  buildSubjectSessions,
  eligibleEnrollments,
  myGeneralAttendanceKey,
  mySubjectAttendanceKey,
  subjectEnrollmentsKey,
  type DayRow,
  type EnrollmentData,
  type SubjectItem,
} from '@/lib/attendanceRows';
import type { ClassMembership } from '@/lib/studentClasses';
import type { GeneralAttendanceDocument } from '@/types/attendance';
import { LIST_STALE_MS, LIVE_STALE_MS } from '@/lib/queryPolicies';

// The attendance a student sees on My Attendance and a parent sees for a child on Child Attendance, as cached
// queries (lib/attendanceRows.ts has the rules and the keys). A visit inside the 60 second window reads nothing and
// a teacher's new mark shows within it. Each query keeps only the one person's rows.

type Term = { startDate: string; endDate: string } | null | undefined;

const liveReads = (institutionId: string | null | undefined) =>
  DATA_MODE === 'live' && !!institutionId && institutionId !== '*';

/** The person's AM and PM state for every marked day of the term. */
export function useMyGeneralAttendance({ uid, classId, term }: { uid: string | undefined; classId: string | null | undefined; term: Term }) {
  const { institutionId } = useAuth();
  return useQuery({
    queryKey: myGeneralAttendanceKey(institutionId ?? '', classId ?? '', uid ?? '', term?.startDate ?? '', term?.endDate ?? ''),
    queryFn: async (): Promise<DayRow[]> => {
      const snap = await getDocs(
        query(
          institutionCollection(institutionId as string, 'generalAttendance'),
          where('classId', '==', classId),
          where('date', '>=', term!.startDate),
          where('date', '<=', term!.endDate),
        ),
      );
      return buildDayRows(
        snap.docs.map((d) => d.data() as GeneralAttendanceDocument),
        uid as string,
      );
    },
    staleTime: LIVE_STALE_MS,
    enabled: liveReads(institutionId) && !!uid && !!classId && !!term,
  });
}

/**
 * Every subject enrollment of the institution, read once and shared by the student and parent pages (and kept five
 * minutes). The Subject form's save refreshes it with the subjects (FormModal).
 */
export function useSubjectEnrollments(enabled = true) {
  const { institutionId } = useAuth();
  return useQuery({
    queryKey: subjectEnrollmentsKey(institutionId ?? ''),
    queryFn: async (): Promise<EnrollmentData[]> => {
      const snap = await getDocs(institutionCollection(institutionId as string, 'subjectEnrollments'));
      return snap.docs.map((d) => d.data() as EnrollmentData);
    },
    staleTime: LIST_STALE_MS,
    enabled: enabled && liveReads(institutionId),
  });
}

/** The person's sessions for each subject their class takes, from the start of the term to today. */
export function useMySubjectAttendance({ uid, member, term }: { uid: string | undefined; member: ClassMembership; term: Term }): {
  items: SubjectItem[];
  loading: boolean;
} {
  const { institutionId } = useAuth();
  const live = liveReads(institutionId) && !!uid && !!member.classId && !!term;
  const enrollments = useSubjectEnrollments(live);
  // The subjects drop an enrollment whose subject was deleted or no longer includes the class. If they cannot be
  // read, nothing is dropped.
  const subjects = useAllInstitutionSubjects();
  const subjectList = subjects.isError ? null : (subjects.data ?? null);
  const ready = live && enrollments.isSuccess && !subjects.isLoading;
  const eligible = ready ? eligibleEnrollments(enrollments.data, subjectList, member, uid as string) : [];
  const today = new Date().toISOString().slice(0, 10);

  const sessions = useQueries({
    queries: eligible.map((enrollment) => ({
      queryKey: mySubjectAttendanceKey(institutionId as string, uid as string, enrollment.subjectId, enrollment.classId, term!.startDate, today),
      queryFn: async () => {
        const snap = await getDocs(
          query(
            institutionCollection(institutionId as string, 'subjectAttendance'),
            where('subjectId', '==', enrollment.subjectId),
            where('classId', '==', enrollment.classId),
            where('sessionDate', '>=', term!.startDate),
            where('sessionDate', '<=', today),
          ),
        );
        return buildSubjectSessions(
          snap.docs.map((d) => d.data()),
          uid as string,
        );
      },
      staleTime: LIVE_STALE_MS,
    })),
  });

  const loading = live && (enrollments.isLoading || subjects.isLoading || sessions.some((s) => s.isLoading));
  const items = ready ? buildSubjectItems(eligible, sessions.map((s) => s.data ?? [])) : [];
  return { items, loading };
}
