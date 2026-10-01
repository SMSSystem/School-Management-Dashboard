import { useEffect, useState } from 'react';
import {
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, type LessonNoteDocument } from '@/lib/firebase';
import { institutionCollection } from '@/lib/paths';
import { useAuth } from '@/lib/AuthContext';
import { useLinkedStudentIds } from '@/lib/useLinkedStudentIds';
import { USE_MOCK } from '@/lib/data';

export type LessonNote = LessonNoteDocument & { id: string };

const CLIENT_ERROR = 'Could not load lesson notes. Please try again.';

// updatedAt is a Timestamp once written; briefly null on the local snapshot
// of a pending serverTimestamp(), which sorts as "newest".
function millis(note: LessonNote): number {
  const t = note.updatedAt as { toMillis?: () => number } | null | undefined;
  return t?.toMillis ? t.toMillis() : Number.MAX_SAFE_INTEGER;
}

// Subscribes to several equality-only queries and emits their merged,
// de-duplicated union. Every role's read rule only admits a query whose
// filters prove every returned note is readable (a query is denied in full
// otherwise), so each role gets its own query shape — see firestore.rules'
// lessonNotes block. Sorting is client-side to avoid composite indexes.
function subscribeMerged(
  queries: Query[],
  emit: (notes: LessonNote[]) => void,
  fail: () => void,
): Unsubscribe {
  const results = queries.map(() => new Map<string, LessonNote>());
  const ready = queries.map(() => false);
  const unsubs = queries.map((q, i) =>
    onSnapshot(
      q,
      (snap) => {
        results[i].clear();
        snap.docs.forEach((d) =>
          results[i].set(d.id, { id: d.id, ...(d.data() as LessonNoteDocument) }),
        );
        ready[i] = true;
        if (!ready.every(Boolean)) return;
        const merged = new Map<string, LessonNote>();
        results.forEach((r) => r.forEach((n, id) => merged.set(id, n)));
        emit([...merged.values()].sort((a, b) => millis(b) - millis(a)));
      },
      fail,
    ),
  );
  return () => unsubs.forEach((u) => u());
}

// Role-aware read of institutions/{id}/lessonNotes — LESSON_NOTES_FEATURE_SPEC.md §7.
//   institution_admin   whole collection
//   regular_teacher     own notes
//   senior_teacher      own + same-department regular_teacher notes
//   student             notes linked to their own class
//   parent              notes linked to any linked child's class
// super_admin has no institution selected (institutionId '*'), so nothing loads.
export function useLessonNotes(): { notes: LessonNote[]; loading: boolean; error: string | null } {
  const { role, institutionId, user, classId } = useAuth();
  const { linkedStudentIds, loading: linkedLoading } = useLinkedStudentIds();
  const [notes, setNotes] = useState<LessonNote[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === '*' || !user || !role) {
      setNotes([]);
      setLoading(false);
      return;
    }
    const col = institutionCollection(institutionId, 'lessonNotes');
    let cancelled = false;
    let unsub: Unsubscribe | null = null;

    const emit = (next: LessonNote[]) => {
      if (cancelled) return;
      setError(null);
      setNotes(next);
      setLoading(false);
    };
    const fail = () => {
      if (cancelled) return;
      setError(CLIENT_ERROR);
      setLoading(false);
    };
    const empty = () => emit([]);

    setLoading(true);

    if (role === 'institution_admin' || role === 'super_admin') {
      unsub = subscribeMerged([col], emit, fail);
    } else if (role === 'regular_teacher') {
      unsub = subscribeMerged([query(col, where('teacherId', '==', user.uid))], emit, fail);
    } else if (role === 'senior_teacher') {
      // Two separate queries, merged: a single departmentId == query would
      // also match another senior_teacher's notes, which the narrow rule
      // denies — failing the whole query rather than filtering them out.
      getDoc(doc(db, 'users', user.uid))
        .then((snap) => {
          if (cancelled) return;
          const departmentId = snap.data()?.departmentId as string | undefined;
          const queries = [query(col, where('teacherId', '==', user.uid))];
          if (departmentId) {
            queries.push(
              query(
                col,
                where('departmentId', '==', departmentId),
                where('teacherRole', '==', 'regular_teacher'),
              ),
            );
          }
          unsub = subscribeMerged(queries, emit, fail);
        })
        .catch(fail);
    } else if (role === 'student') {
      if (classId) unsub = subscribeMerged([query(col, where('classId', '==', classId))], emit, fail);
      else empty();
    } else if (role === 'parent') {
      if (linkedLoading) return; // re-runs once the linked students resolve
      if (linkedStudentIds.length === 0) {
        empty();
      } else {
        // Notes are keyed by classId, not studentId, so each linked child's
        // class is resolved first. Firestore `in` allows 10 values.
        Promise.all(
          linkedStudentIds.slice(0, 10).map((sid) =>
            getDoc(doc(db, 'users', sid)).then((s) => s.data()?.classId as string | undefined),
          ),
        )
          .then((ids) => {
            if (cancelled) return;
            const classIds = [...new Set(ids.filter((id): id is string => !!id))].slice(0, 10);
            if (classIds.length === 0) empty();
            else unsub = subscribeMerged([query(col, where('classId', 'in', classIds))], emit, fail);
          })
          .catch(fail);
      }
    } else {
      empty();
    }

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [role, institutionId, user, classId, linkedStudentIds, linkedLoading]);

  return { notes, loading, error };
}
