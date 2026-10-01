import { useAuth } from '@/lib/AuthContext';
import { isDepartmentMissing } from '@/lib/departmentRequirement';
import { useInstitutionDepartments } from '@/hooks/useInstitutionDepartments';

export type MyDepartment = {
  departmentId: string | null;
  institutionHasDepartments: boolean;
  // True only for a signed-in teacher with no department, in an institution
  // that has departments to choose from — see departmentRequirement.ts.
  missing: boolean;
  loading: boolean;
};

// The signed-in teacher's own departmentId, from the users doc AuthContext
// already reads at sign-in (so this costs no Firestore read of its own).
// AuthContext's `department` is the display NAME, not the id firestore.rules
// and every denormalizing form actually key off, so it can't be used here.
// Never `missing` for a non-teacher role.
export function useMyDepartment(): MyDepartment {
  const { role, departmentId, loading: authLoading } = useAuth();
  const { data: departments, isLoading: departmentsLoading } = useInstitutionDepartments();

  const institutionHasDepartments = (departments?.length ?? 0) > 0;
  const loading = authLoading || departmentsLoading;
  return {
    departmentId,
    institutionHasDepartments,
    loading,
    missing: !loading && isDepartmentMissing(role, departmentId, institutionHasDepartments),
  };
}
