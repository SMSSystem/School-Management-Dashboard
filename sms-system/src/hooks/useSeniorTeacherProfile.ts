import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { onLoadError } from '@/lib/reportError';
import { USE_MOCK } from '@/lib/data';
import { readThrough } from '@/lib/offline/workingCopy';
import { homeroomCopyName, homeroomOf, type SeniorTeacherProfile } from '@/lib/offline/todaysRegisters';

export type { SeniorTeacherProfile } from '@/lib/offline/todaysRegisters';

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
    readThrough(homeroomCopyName(user.uid), async () => {
      const snap = await getDoc(doc(db, 'users', user.uid));
      return { value: homeroomOf(snap.data()), fromCache: snap.metadata.fromCache };
    }).then(
      (read) => {
        setProfile(read.value);
        setLoading(false);
      },
      onLoadError('your class', () => setLoading(false)),
    );
  }, [user, role]);

  return { ...profile, loading };
}
