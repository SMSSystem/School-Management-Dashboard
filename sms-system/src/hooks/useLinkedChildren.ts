import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { useLinkedStudentIds } from '@/lib/useLinkedStudentIds';
import { USE_MOCK } from '@/lib/data';

export type LinkedChild = { uid: string; name: string; classId: string | null };

// The signed-in parent's linked children with their class, for pages that scope
// data by the child's class (Schedule). Builds on useLinkedStudentIds (one
// student_parents query) plus one users read per child (at most 10, the same cap
// the other parent queries use). No-op, never loading, for every other role.
export function useLinkedChildren(): { children: LinkedChild[]; loading: boolean } {
  const { role } = useAuth();
  const { linkedStudentIds, loading: idsLoading } = useLinkedStudentIds();
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [loading, setLoading] = useState(role === 'parent');

  useEffect(() => {
    if (USE_MOCK || role !== 'parent') {
      setChildren([]);
      setLoading(false);
      return;
    }
    if (idsLoading) return;
    if (linkedStudentIds.length === 0) {
      setChildren([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      linkedStudentIds.slice(0, 10).map(async (sid): Promise<LinkedChild | null> => {
        const snap = await getDoc(doc(db, 'users', sid));
        if (!snap.exists()) return null;
        const d = snap.data();
        return { uid: sid, name: (d.name as string) ?? sid, classId: (d.classId as string) ?? null };
      }),
    )
      .then((rows) => {
        if (!cancelled) setChildren(rows.filter((r): r is LinkedChild => r !== null));
      })
      .catch(() => {
        if (!cancelled) setChildren([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role, linkedStudentIds, idsLoading]);

  return { children, loading };
}
