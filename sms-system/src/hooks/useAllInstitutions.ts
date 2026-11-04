import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db, type InstitutionDocument } from '@/lib/firebase';
import { DATA_MODE } from '@/lib/data';
import { queryClient } from '@/lib/queryClient';
import { REFERENCE_STALE_MS } from '@/lib/queryPolicies';
import { INSTITUTIONS_ROOT, allInstitutionsKey, invalidateInstitutionsIn } from '@/lib/institutionsCache';

// Every institution on the platform, for the super admin's pages (the Create User picker, the spectators and
// audit-log names, brand settings, manage admins). One shared, cached read instead of each page reading the whole
// collection on every visit. The root key 'institutions' is deliberately not in the persisted allow-list
// (queryPersistence.ts): it is a platform-level list, kept in memory for the session.
//
// Everything cached under the 'institutions' root (this list, the dashboard's pages, recent sign-ups) is
// refreshed by invalidateInstitutions(), which the forms that create or change an institution call after saving.
type PlatformInstitution = InstitutionDocument & { id: string };

export { INSTITUTIONS_ROOT };

async function fetchAllInstitutions(): Promise<PlatformInstitution[]> {
  const snap = await getDocs(collection(db, 'institutions'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as InstitutionDocument) }));
}

export function useAllInstitutions(enabled: boolean) {
  return useQuery({
    queryKey: allInstitutionsKey,
    queryFn: fetchAllInstitutions,
    staleTime: REFERENCE_STALE_MS,
    enabled: enabled && DATA_MODE === 'live',
  });
}

/** Drops every cached institutions read, so the next visit reads the change. */
export function invalidateInstitutions(): Promise<void> {
  return invalidateInstitutionsIn(queryClient);
}
