import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './AuthContext';

export interface LinkedStudentIdsResult {
  linkedStudentIds: string[];
  loading: boolean;
}

/**
 * Resolves the current parent's linked student IDs from `student_parents`.
 * No-op (empty, not loading) for any role other than 'parent'.
 */
export function useLinkedStudentIds(): LinkedStudentIdsResult {
  const { user, role } = useAuth();
  const [linkedStudentIds, setLinkedStudentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(role === 'parent');

  useEffect(() => {
    if (role !== 'parent' || !user) {
      setLinkedStudentIds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getDocs(query(collection(db, 'student_parents'), where('parentId', '==', user.uid)))
      .then((snap) => setLinkedStudentIds(snap.docs.map((d) => d.data().studentId as string)))
      .finally(() => setLoading(false));
  }, [role, user]);

  return { linkedStudentIds, loading };
}
