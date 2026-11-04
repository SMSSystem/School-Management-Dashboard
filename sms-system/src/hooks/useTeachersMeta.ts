import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { onLoadError } from '@/lib/reportError';
import { LIST_STALE_MS } from '@/lib/queryPolicies';

type TeacherMetaRole = 'regular_teacher' | 'senior_teacher' | 'institution_admin';
type TeacherMetaEntry = { departmentId?: string; role?: TeacherMetaRole };

const EMPTY: Record<string, TeacherMetaEntry> = {};

// Every teacher's department and role by user id, for the forms that stamp them on what they save (the Assignment
// and Exam forms: the deployed rules let a senior teacher edit anything in their department through that field).
// One shared, cached read under the 'users' root (so a saved user refreshes it, like the other people lists)
// instead of a read per form opening. An institution admin can be a subject's teacher too (teachingStaff.ts).
//
// The users read rule rejects this query for any teacher-role caller (ISSUES_AND_GAPS.md #37), so for them it
// resolves to an empty map, logged but never shown, and the forms fall back to the caller's own profile.
export function useTeachersMeta() {
  const { institutionId } = useAuth();
  const query_ = useQuery({
    queryKey: ['users', institutionId ?? '', 'teacherMeta'],
    queryFn: async (): Promise<Record<string, TeacherMetaEntry>> => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'users'),
            where('institutionId', '==', institutionId),
            where('role', 'in', ['regular_teacher', 'senior_teacher', 'institution_admin']),
          ),
        );
        const map: Record<string, TeacherMetaEntry> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          map[d.id] = {
            departmentId: data.departmentId as string | undefined,
            role: data.role as TeacherMetaRole | undefined,
          };
        });
        return map;
      } catch (err) {
        onLoadError("the teachers' departments", undefined, { quiet: true })(err);
        return {};
      }
    },
    staleTime: LIST_STALE_MS,
    enabled: DATA_MODE === 'live' && !!institutionId && institutionId !== '*',
  });
  return query_.data ?? EMPTY;
}
