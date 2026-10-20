import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import type { ClassMembership } from '@/lib/studentClasses';

// The signed-in student's classes (home class, every class, chosen subjects per additional class), as one
// object that keeps its identity between renders, for the hooks that take a student (useClassTimetable).
export function useOwnClasses(): ClassMembership {
  const { classId, classIds, classSubjects } = useAuth();
  return useMemo(() => ({ classId, classIds, classSubjects }), [classId, classIds, classSubjects]);
}
