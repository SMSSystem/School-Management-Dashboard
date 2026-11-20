import { collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { institutionCollection } from './paths';
import { queryClient } from './queryClient';
import { fetchInstitutionClasses } from '@/hooks/useInstitutionClasses';
import { fetchInstitutionSubjects } from '@/lib/subjectsQuery';
import { buildAssignments, type SlotLite, type SubjectLite } from './gradeEntryTracking';
import { TRACKING_STALE_MS, rosterFromCounts, trackingQueryKey, type TrackingData } from './gradeTrackingCache';

// Loads everything Grade-Entry Tracking needs for one term, through the cache in gradeTrackingCache.ts.
//
// It reads every result and feedback comment of the term (a document each: thousands for a
// school of a few hundred students), so the page calls it only when asked, and a second call
// inside the cache window costs nothing. The class rosters come from one count query per class
// (billed as one read each) instead of reading every student document.

function toISOStringSafe(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

async function loadTrackingData(institutionId: string, termId: string): Promise<TrackingData> {
  const termScope = where('termId', '==', termId);
  const [slotSnap, allSubjects, classes, resSnap, fbSnap] = await Promise.all([
    getDocs(query(institutionCollection(institutionId, 'timetable_slots'), termScope)),
    fetchInstitutionSubjects(institutionId, null, undefined),
    fetchInstitutionClasses(institutionId),
    getDocs(query(institutionCollection(institutionId, 'results'), termScope)),
    getDocs(query(institutionCollection(institutionId, 'feedback_comments'), termScope)),
  ]);

  // One count query per class: equality and array-contains filters only, so no composite index. It counts
  // every student of the class (home or additional), so for a student who takes only some subjects as an
  // additional class the expected count is an upper bound (lib/studentClasses.ts).
  const counts = await Promise.all(
    classes.map(async (c) => {
      const snap = await getCountFromServer(
        query(
          collection(db, 'users'),
          where('institutionId', '==', institutionId),
          where('role', '==', 'student'),
          where('classIds', 'array-contains', c.id),
        ),
      );
      return { classId: c.id, count: snap.data().count };
    }),
  );

  const slots: SlotLite[] = slotSnap.docs.map((d) => {
    const x = d.data();
    return {
      teacherId: x.teacherId as string,
      teacherName: (x.teacherName as string) ?? (x.teacherId as string),
      subjectId: x.subjectId as string,
      subjectName: (x.subjectName as string) ?? (x.subjectId as string),
      classId: x.classId as string,
      className: (x.className as string) ?? (x.classId as string),
    };
  });

  const subjects: SubjectLite[] = allSubjects.map((s) => ({
    subjectId: s.id,
    subjectName: s.name ?? s.id,
    teacherIds: s.teacherIds ?? [],
    teacherNames: s.teacherNames ?? [],
    classIds: s.classIds ?? [],
    classNames: s.classNames ?? [],
  }));

  return {
    assignments: buildAssignments(slots, subjects),
    results: resSnap.docs.map((d) => {
      const x = d.data();
      return {
        subjectId: x.subjectId as string,
        classId: x.classId as string,
        studentId: x.studentId as string,
        assessmentName: (x.assessmentName as string) ?? '',
        date: x.date as string | undefined,
      };
    }),
    feedback: fbSnap.docs.map((d) => {
      const x = d.data();
      return {
        subjectId: x.subjectId as string,
        classId: x.classId as string,
        studentId: x.studentId as string,
        createdAt: toISOStringSafe(x.createdAt),
      };
    }),
    rosters: rosterFromCounts(counts),
    docsRead: slotSnap.size + resSnap.size + fbSnap.size + classes.length,
  };
}

/** Loads (or returns the fresh cached) data; `force` ignores the cache and reads again. */
export function fetchTrackingData(institutionId: string, termId: string, force = false): Promise<TrackingData> {
  return queryClient.fetchQuery({
    queryKey: trackingQueryKey(institutionId, termId),
    queryFn: () => loadTrackingData(institutionId, termId),
    staleTime: force ? 0 : TRACKING_STALE_MS,
  });
}
