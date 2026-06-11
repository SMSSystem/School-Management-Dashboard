import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';

export interface SeniorTeacherProfile {
  assignedClassId: string | null;
  assignedClassName: string | null;
}

export function useSeniorTeacherProfile(): SeniorTeacherProfile & { loading: boolean } {
  const { user, role } = useAuth();
  const [profile, setProfile] = useState<SeniorTeacherProfile>({
    assignedClassId: null,
    assignedClassName: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (USE_MOCK || !user || role !== 'senior_teacher') {
      setLoading(false);
      return;
    }
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      const data = snap.data();
      setProfile({
        assignedClassId: data?.assignedClassId ?? null,
        assignedClassName: data?.assignedClassName ?? null,
      });
      setLoading(false);
    });
  }, [user, role]);

  return { ...profile, loading };
}
