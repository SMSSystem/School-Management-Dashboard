import { useMemo } from 'react';
import { useInstitutionUsers } from '@/hooks/useInstitutionUsers';
import { teachingStaff, type TeachingStaffMember } from '@/lib/teachingStaff';

/**
 * Senior teachers, regular teachers and institution admins of the signed-in
 * admin's institution. Built on the shared cached users query, so it costs no
 * extra read when the Teachers/Students/Parents lists (or another picker) have
 * already loaded it. For admin-side pickers only: the users rules let a teacher
 * read only students.
 */
export function useTeachingStaff(): { staff: TeachingStaffMember[]; isLoading: boolean } {
  const { data, isLoading } = useInstitutionUsers();
  const staff = useMemo(() => teachingStaff(data ?? []), [data]);
  return { staff, isLoading };
}
