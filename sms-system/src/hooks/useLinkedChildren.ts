import { classIdsOf } from '@/lib/studentClasses';
import { useQuery } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';

export type LinkedChild = { uid: string; name: string; classId: string | null; classIds: string[]; classSubjects: Record<string, string[]> };

const EMPTY: LinkedChild[] = [];

// The signed-in parent's linked children with their class, for pages that scope
// data by the child's class (Schedule, the parent dashboard). One student_parents
// query plus one users read per child (at most 10, the same cap the other parent
// queries use). Cached by React Query for 5 minutes, so the Schedule page and the
// dashboard share one load instead of each reading it on every visit. No-op,
// never loading, for every other role.
export function useLinkedChildren(): { children: LinkedChild[]; loading: boolean } {
  const { user, role } = useAuth();
  const enabled = !USE_MOCK && role === 'parent' && !!user;

  const childrenQuery = useQuery({
    queryKey: ['linkedChildren', user?.uid],
    queryFn: async (): Promise<LinkedChild[]> => {
      const links = await getDocs(query(collection(db, 'student_parents'), where('parentId', '==', user!.uid)));
      const studentIds = links.docs.map((d) => d.data().studentId as string).slice(0, 10);
      const rows = await Promise.all(
        studentIds.map(async (sid): Promise<LinkedChild | null> => {
          const snap = await getDoc(doc(db, 'users', sid));
          if (!snap.exists()) return null;
          const d = snap.data();
          return {
            uid: sid,
            name: (d.name as string) ?? sid,
            classId: (d.classId as string) ?? null,
            classIds: classIdsOf(d),
            classSubjects: (d.classSubjects as Record<string, string[]> | undefined) ?? {},
          };
        }),
      );
      return rows.filter((r): r is LinkedChild => r !== null);
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  return {
    children: childrenQuery.data ?? EMPTY,
    loading: enabled && childrenQuery.isLoading,
  };
}
