import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { useInstitutionUsers } from '@/hooks/useInstitutionUsers';
import { useAllInstitutions } from '@/hooks/useAllInstitutions';

export type SpectatorRow = {
  id: string;
  name: string;
  email?: string;
  phone: string;
  institutionId: string;
  institutionName: string;
  status?: string;
};

const toRow = (id: string, data: Record<string, unknown>): SpectatorRow => ({
  id,
  name: (data.name as string) ?? '—',
  email: data.email as string | undefined,
  phone: (data.phone as string) ?? '—',
  institutionId: (data.institutionId as string) ?? '',
  institutionName: '',
  status: data.status as string | undefined,
});

/**
 * The spectator accounts the signed-in admin manages.
 *  - institution_admin: their own institution's spectators, taken from the shared
 *    cached users query (the same one the Teachers/Students/Parents lists use), so
 *    this page costs no extra reads when one of those is already loaded.
 *  - super_admin: every spectator in every institution (a small live query on
 *    role == 'spectator' plus a one-off read of the institution names), each row
 *    carrying its institution.
 * Read only. Deactivating and clearing a session are done by the existing
 * AccountStatusToggle and SessionResetButton on each row.
 */
export function useSpectators(): { spectators: SpectatorRow[]; loading: boolean } {
  const { role } = useAuth();
  const isSuper = role === 'super_admin';
  const { data: institutionUsers, isLoading } = useInstitutionUsers();

  const [all, setAll] = useState<SpectatorRow[] | null>(null);
  // Institution names come from the shared cached list (hooks/useAllInstitutions.ts).
  const allInstitutions = useAllInstitutions(isSuper);
  const names = useMemo<Record<string, string>>(
    () => Object.fromEntries((allInstitutions.data ?? []).map((d) => [d.id, d.name ?? d.id])),
    [allInstitutions.data],
  );

  useEffect(() => {
    if (!isSuper || DATA_MODE !== 'live') return;
    return onSnapshot(
      query(collection(db, 'users'), where('role', '==', 'spectator')),
      (snap) => setAll(snap.docs.map((d) => toRow(d.id, d.data()))),
      () => setAll([]),
    );
  }, [isSuper]);

  const spectators = useMemo(() => {
    const base = isSuper
      ? (all ?? [])
      : (institutionUsers ?? []).filter((u) => u.role === 'spectator').map((u) => toRow(u.id, u));
    return base
      .map((r) => ({ ...r, institutionName: names[r.institutionId] ?? r.institutionId }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [isSuper, all, institutionUsers, names]);

  return { spectators, loading: isSuper ? all === null : isLoading };
}
