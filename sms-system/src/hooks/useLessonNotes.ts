import { useEffect, useState } from 'react';
import {
  doc,
  getDoc,
  limit,
  orderBy,
  query,
  where,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, type LessonNoteDocument } from '@/lib/firebase';
import { institutionCollection } from '@/lib/paths';
import { subscribeSnapshot } from '@/lib/sharedSnapshot';
import { useAuth } from '@/lib/AuthContext';
import { useLinkedStudentIds } from '@/lib/useLinkedStudentIds';
import { USE_MOCK } from '@/lib/data';
import { hasAdminView } from '@/lib/roleCapabilities';
import { classIdsOf, readClassSubjects, type ClassMembership } from '@/lib/studentClasses';
import { idGroups, isNoteVisibleTo } from '@/lib/lessonNoteClasses';

export type LessonNote = LessonNoteDocument & { id: string };

const CLIENT_ERROR = 'Could not load lesson notes. Please try again.';

// Free-tier guard: every listener reads at most this many notes (the newest),
// so a large institution can't re-read its whole history on each visit.
// Each role's query below is equality filters + orderBy updatedAt, which needs
// the composite indexes in firestore.indexes.json.
export const LESSON_NOTES_LIMIT = 100;

const newest = [orderBy('updatedAt', 'desc'), limit(LESSON_NOTES_LIMIT)] as const;

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
// lessonNotes block. Queries with several sources are merged and re-sorted here.
function subscribeMerged(
  queries: Query[],
  emit: (notes: LessonNote[], capped: boolean) => void,
  fail: () => void,
): Unsubscribe {
  const results = queries.map(() => new Map<string, LessonNote>());
  const ready = queries.map(() => false);
  const unsubs = queries.map((q, i) =>
    // Shared and kept open for a while after the page is left (lib/sharedSnapshot.ts); a different query under the
    // same key never shares, so the key only has to tell the queries of one role apart.
    subscribeSnapshot(
      `lessonNotes:${i}`,
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
        const sorted = [...merged.values()].sort((a, b) => millis(b) - millis(a));
        emit(sorted.slice(0, LESSON_NOTES_LIMIT), results.some((r) => r.size >= LESSON_NOTES_LIMIT));
      },
      fail,
    ),
  );
  return () => unsubs.forEach((u) => u());
}

// The notes of some classes. A note for several classes lists them in classIds and also holds the first in classId;
// a note from before that holds classId only, so both are asked: `classIds array-contains-any` finds every note
// with a class list, `classId in` the older ones. Each filter takes at most 10 values, so the ids go in groups.
// The rule lets a student or parent read any note that has a class (it cannot be narrower: see lessonNoteReadableBy
// in firestore.rules), so these filters and isNoteVisibleTo() are what limit the list to their classes.
function classQueries(col: ReturnType<typeof institutionCollection>, ids: string[]): Query[] {
  return idGroups(ids).flatMap((group) => [
    query(col, where('classId', 'in', group), ...newest),
    query(col, where('classIds', 'array-contains-any', group), ...newest),
  ]);
}

// Role-aware read of institutions/{id}/lessonNotes — LESSON_NOTES_FEATURE_SPEC.md §7.
//   institution_admin   whole collection (as do super_admin and spectator)
//   regular_teacher     own notes
//   senior_teacher      own + same-department regular_teacher notes
//   student             notes for any of their classes
//   parent              notes for any class of a linked child
// super_admin has no institution selected (institutionId '*'), so nothing loads.
export function useLessonNotes(): {
  notes: LessonNote[];
  loading: boolean;
  error: string | null;
  // True when more notes exist than LESSON_NOTES_LIMIT, so only the newest show.
  capped: boolean;
} {
  const { role, institutionId, user, classId, classIds, classSubjects } = useAuth();
  const { linkedStudentIds, loading: linkedLoading } = useLinkedStudentIds();
  const [notes, setNotes] = useState<LessonNote[]>([]);
  const [loading, setLoading] = useState(!USE_MOCK);
  const [error, setError] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === '*' || !user || !role) {
      setNotes([]);
      setLoading(false);
      return;
    }
    const col = institutionCollection(institutionId, 'lessonNotes');
    let cancelled = false;
    let unsub: Unsubscribe | null = null;

    const emit = (next: LessonNote[], isCapped = false) => {
      if (cancelled) return;
      setError(null);
      setNotes(next);
      setCapped(isCapped);
      setLoading(false);
    };
    const fail = () => {
      if (cancelled) return;
      setError(CLIENT_ERROR);
      setLoading(false);
    };
    const empty = () => emit([]);

    setLoading(true);

    if (hasAdminView(role)) {
      // super_admin, institution_admin and spectator all read the whole collection.
      unsub = subscribeMerged([query(col, ...newest)], emit, fail);
    } else if (role === 'regular_teacher') {
      unsub = subscribeMerged([query(col, where('teacherId', '==', user.uid), ...newest)], emit, fail);
    } else if (role === 'senior_teacher') {
      // Two separate queries, merged: a single departmentId == query would
      // also match another senior_teacher's notes, which the narrow rule
      // denies — failing the whole query rather than filtering them out.
      getDoc(doc(db, 'users', user.uid))
        .then((snap) => {
          if (cancelled) return;
          const departmentId = snap.data()?.departmentId as string | undefined;
          const queries = [query(col, where('teacherId', '==', user.uid), ...newest)];
          if (departmentId) {
            queries.push(
              query(
                col,
                where('departmentId', '==', departmentId),
                where('teacherRole', '==', 'regular_teacher'),
                ...newest,
              ),
            );
          }
          unsub = subscribeMerged(queries, emit, fail);
        })
        .catch(fail);
    } else if (role === 'student') {
      // The classes the student is in (home or additional), asked for in groups of Firestore's filter limit.
      // Notes of subjects they do not take in an additional class are hidden.
      const me = { classId, classIds, classSubjects };
      const visible = (notes: LessonNote[], capped: boolean) =>
        emit(
          notes.filter((n) => isNoteVisibleTo(n, me)),
          capped,
        );
      if (classIds.length > 0) {
        unsub = subscribeMerged(classQueries(col, classIds), visible, fail);
      } else empty();
    } else if (role === 'parent') {
      if (linkedLoading) return; // re-runs once the linked students resolve
      if (linkedStudentIds.length === 0) {
        empty();
      } else {
        // Notes are keyed by class, not studentId, so each linked child's
        // classes are resolved first.
        Promise.all(
          linkedStudentIds.slice(0, 10).map((sid) =>
            getDoc(doc(db, 'users', sid)).then(
              (s): ClassMembership => ({
                classId: s.data()?.classId,
                classIds: s.data()?.classIds,
                classSubjects: readClassSubjects(s.data()?.classSubjects),
              }),
            ),
          ),
        )
          .then((children) => {
            if (cancelled) return;
            const ids = [...new Set(children.flatMap((c) => classIdsOf(c)))];
            if (ids.length === 0) empty();
            else {
              unsub = subscribeMerged(
                classQueries(col, ids),
                (notes, capped) => emit(notes.filter((n) => children.some((c) => isNoteVisibleTo(n, c))), capped),
                fail,
              );
            }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, institutionId, user, classId, classIds.join(','), linkedStudentIds, linkedLoading]);

  return { notes, loading, error, capped };
}
