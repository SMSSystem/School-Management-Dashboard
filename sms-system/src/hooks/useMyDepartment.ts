import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';
import { isDepartmentMissing, isTeacherRole } from '@/lib/departmentRequirement';
import { useInstitutionDepartments } from '@/hooks/useInstitutionDepartments';

export type MyDepartment = {
  departmentId: string | null;
  institutionHasDepartments: boolean;
  // True only for a signed-in teacher with no department, in an institution
  // that has departments to choose from — see departmentRequirement.ts.
  missing: boolean;
  loading: boolean;
};

// The signed-in teacher's own departmentId, read from their users doc.
// AuthContext's `department` is the display NAME, not the id firestore.rules
// and every denormalizing form actually key off, so it can't be used here.
// No-op (never `missing`) for any non-teacher role.
export function useMyDepartment(): MyDepartment {
  const { user, role } = useAuth();
  const { data: departments, isLoading: departmentsLoading } = useInstitutionDepartments();
  // undefined = still loading.
  const [departmentId, setDepartmentId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (USE_MOCK || !user || !isTeacherRole(role)) {
      setDepartmentId(null);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (!cancelled) setDepartmentId((snap.data()?.departmentId as string | undefined) ?? null);
      })
      // A failed read must not show a false "you have no department" warning.
      .catch(() => {
        if (!cancelled) setDepartmentId(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [user, role]);

  const institutionHasDepartments = (departments?.length ?? 0) > 0;
  const loading = departmentId === undefined || departmentsLoading;
  return {
    departmentId: departmentId ?? null,
    institutionHasDepartments,
    loading,
    missing: !loading && isDepartmentMissing(role, departmentId, institutionHasDepartments),
  };
}
