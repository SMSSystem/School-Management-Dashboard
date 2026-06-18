import { useEffect, useState } from 'react';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db, ClassDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';

interface StudentRow {
  uid: string;
  name: string;
  classId: string | null;
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
    if (USE_MOCK || !institutionId) { setLoading(false); return; }

    Promise.all([
      getDocs(
        query(
          collection(db, 'users'),
          where('institutionId', '==', institutionId),
          where('role', '==', 'student'),
        )
      ),
      getDocs(
        query(collection(db, 'classes'), where('institutionId', '==', institutionId))
      ),
    ])
      .then(([userSnap, classSnap]) => {
        const allStudents: StudentRow[] = userSnap.docs.map((d) => ({
          uid: d.id,
          name: (d.data().name as string) ?? d.id,
          classId: (d.data().classId as string | null) ?? null,
          pendingClassId: (d.data().classId as string) ?? '',
          saving: false,
          saved: false,
          error: null,
        }));
        setStudents(allStudents);
        setClasses(classSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassDocument & { id: string })));
      })
      .catch(() => {})
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
      await updateDoc(doc(db, 'users', uid), {
        classId: student.pendingClassId || null,
      });
      setStudents((prev) =>
        prev.map((s) =>
          s.uid === uid
            ? { ...s, saving: false, saved: true, classId: student.pendingClassId || null }
            : s
        )
      );
    } catch (err) {
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
