import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db, ClassDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';
import { fetchInstitutionClasses } from '@/hooks/useInstitutionClasses';
import { onLoadError } from '@/lib/reportError';
import { populationDelta } from '@/lib/classPopulationDelta';
import { addPopulationDelta } from '@/lib/classPopulationWrite';
import { addParentClassUpdates, studentClassChangeUpdates } from '@/lib/parentLinkedClasses';
import { classIdsOf, extraClassIds, normaliseMembership, readClassSubjects, type ClassMembership } from '@/lib/studentClasses';

interface StudentRow {
  uid: string;
  name: string;
  classId: string | null;
  // As stored: every class (home first) and the subjects chosen per additional class (lib/studentClasses.ts).
  classIds: string[] | null;
  classSubjects: Record<string, string[]>;
  pendingClassId: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
}

export default function BackfillStudentClassesPage() {
  const { institutionId } = useAuth();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [classes, setClasses] = useState<(ClassDocument & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === '*') { setLoading(false); return; }

    Promise.all([
      getDocs(
        query(
          collection(db, 'users'),
          where('institutionId', '==', institutionId),
          where('role', '==', 'student'),
        )
      ),
      fetchInstitutionClasses(institutionId),
    ])
      .then(([userSnap, allClasses]) => {
        const allStudents: StudentRow[] = userSnap.docs.map((d) => ({
          uid: d.id,
          name: (d.data().name as string) ?? d.id,
          classId: (d.data().classId as string | null) ?? null,
          classIds: Array.isArray(d.data().classIds) ? (d.data().classIds as string[]) : null,
          classSubjects: readClassSubjects(d.data().classSubjects),
          pendingClassId: (d.data().classId as string) ?? '',
          saving: false,
          saved: false,
          error: null,
        }));
        setStudents(allStudents);
        setClasses(allClasses);
      })
      .catch(onLoadError('the students and classes'))
      .finally(() => setLoading(false));
  }, [institutionId]);

  function setPending(uid: string, classId: string) {
    setStudents((prev) =>
      prev.map((s) => (s.uid === uid ? { ...s, pendingClassId: classId, saved: false, error: null } : s))
    );
  }

  async function saveOne(uid: string) {
    const student = students.find((s) => s.uid === uid);
    if (!student) return;
    setStudents((prev) => prev.map((s) => (s.uid === uid ? { ...s, saving: true, error: null } : s)));
    try {
      const membership = normaliseMembership({
        classId: student.pendingClassId,
        extraClassIds: extraClassIds({ classId: student.pendingClassId, classIds: student.classIds }),
        classSubjects: student.classSubjects,
      });
      // Read the student fresh and move the class head-counts in the same batch (lib/classPopulationDelta.ts), as every
      // other writer that changes who is in a class does: giving a student a home class puts them in that class's count.
      if (!institutionId) throw new Error('No institution');
      const stored = (await getDoc(doc(db, 'users', uid))).data() ?? {};
      const parentUpdates = await studentClassChangeUpdates(institutionId, uid, stored as ClassMembership, membership);
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', uid), {
        classId: membership.classId,
        classIds: membership.classIds,
        classSubjects: membership.classSubjects,
      });
      addPopulationDelta(
        batch,
        institutionId,
        populationDelta(
          { classIds: classIdsOf(stored as ClassMembership), gender: stored.gender, status: stored.status },
          { classIds: membership.classIds, gender: stored.gender, status: stored.status },
          new Set(classes.map((c) => c.id)),
        ),
      );
      addParentClassUpdates(batch, parentUpdates);
      await batch.commit();
      setStudents((prev) =>
        prev.map((s) =>
          s.uid === uid
            ? { ...s, saving: false, saved: true, classId: student.pendingClassId || null, classIds: membership.classIds }
            : s
        )
      );
    } catch (err) {
      console.error('Failed to save class assignment for', uid, err);
      setStudents((prev) =>
        prev.map((s) =>
          s.uid === uid ? { ...s, saving: false, error: 'Save failed. Check your permissions.' } : s
        )
      );
    }
  }

  async function saveAll() {
    setSavingAll(true);
    const unassigned = students.filter((s) => s.pendingClassId && !s.saved);
    for (const s of unassigned) {
      await saveOne(s.uid);
    }
    setSavingAll(false);
  }

  // Students whose stored class list is missing or does not match their class (the roster, counts and what a
  // student sees are read from `classIds`). Writing it never changes a class.
  const staleLists = students.filter((s) => {
    const want = normaliseMembership({ classId: s.classId, extraClassIds: extraClassIds({ classId: s.classId, classIds: s.classIds }), classSubjects: s.classSubjects }, new Set(classes.map((c) => c.id)));
    return JSON.stringify(want.classIds) !== JSON.stringify(s.classIds ?? []) && !(want.classIds.length === 0 && (s.classIds ?? []).length === 0);
  });
  const [listsBusy, setListsBusy] = useState(false);
  const [listsDone, setListsDone] = useState<number | null>(null);
  async function updateClassLists() {
    setListsBusy(true);
    try {
      const known = new Set(classes.map((c) => c.id));
      for (let i = 0; i < staleLists.length; i += 400) {
        const batch = writeBatch(db);
        for (const s of staleLists.slice(i, i + 400)) {
          const m = normaliseMembership({ classId: s.classId, extraClassIds: extraClassIds({ classId: s.classId, classIds: s.classIds }), classSubjects: s.classSubjects }, known);
          batch.update(doc(db, 'users', s.uid), { classIds: m.classIds, classSubjects: m.classSubjects });
        }
        await batch.commit();
      }
      setStudents((prev) => prev.map((s) => (staleLists.includes(s) ? { ...s, classIds: classIdsOf({ classId: s.classId, classIds: s.classIds } as ClassMembership) } : s)));
      setListsDone(staleLists.length);
    } catch (err) {
      console.error('Could not update the class lists:', err);
    } finally {
      setListsBusy(false);
    }
  }

  const unassignedCount = students.filter((s) => !s.classId).length;
  const pendingCount = students.filter((s) => s.pendingClassId && !s.saved).length;

  if (USE_MOCK) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Student class backfill is not available in demo mode.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Backfill Student Class Assignments
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Assign a homeroom class to students who do not yet have one. Required for the
          attendance register to work correctly.{' '}
          {unassignedCount > 0 && (
            <span className="font-medium text-orange-600 dark:text-orange-400">
              {unassignedCount} student{unassignedCount !== 1 ? 's' : ''} without a class.
            </span>
          )}
          {unassignedCount === 0 && (
            <span className="font-medium text-green-600 dark:text-green-400">
              All students have a class assigned.
            </span>
          )}
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm">
        <h2 className="font-medium text-gray-900 dark:text-gray-100">Class lists</h2>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          Each student carries a list of all their classes (their own class and any additional ones). Class rosters, the Population
          column and what students see are read from it, so every student needs it. This writes the list from each student&apos;s
          class; it changes no class.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={updateClassLists}
            disabled={listsBusy || staleLists.length === 0}
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:bg-sky-300"
          >
            {listsBusy ? 'Updating…' : `Update class lists (${staleLists.length})`}
          </button>
          {staleLists.length === 0 && <span className="text-green-600 dark:text-green-400 font-medium">All class lists are up to date.</span>}
          {listsDone !== null && listsDone > 0 && staleLists.length === 0 && <span className="text-gray-500">{listsDone} updated.</span>}
        </div>
      </div>

      {students.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No students found.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-200">Student</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-200">Current class</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-200">Assign class</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {students.map((s) => {
                  const currentName = classes.find((c) => c.id === s.classId)?.name ?? '—';
                  return (
                    <tr key={s.uid} className="bg-white dark:bg-gray-900">
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{s.name}</td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                        {s.saved
                          ? (classes.find((c) => c.id === (s.pendingClassId || null))?.name ?? '—')
                          : currentName}
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={s.pendingClassId}
                          onChange={(e) => setPending(s.uid, e.target.value)}
                          disabled={s.saving}
                          className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                        >
                          <option value="">No class</option>
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {s.saved ? (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">Saved</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => saveOne(s.uid)}
                            disabled={s.saving || s.pendingClassId === (s.classId ?? '')}
                            className="text-xs font-medium text-sky-600 hover:underline disabled:text-gray-400 disabled:no-underline"
                          >
                            {s.saving ? 'Saving…' : 'Save'}
                          </button>
                        )}
                        {s.error && (
                          <p className="text-xs text-red-500 mt-0.5">{s.error}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pendingCount > 0 && (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={saveAll}
                disabled={savingAll}
                className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:bg-sky-300"
              >
                {savingAll ? 'Saving all…' : `Save all (${pendingCount})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
