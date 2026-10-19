import { getDocs } from 'firebase/firestore';
import { institutionCollection } from '@/lib/paths';
import type { TermDocument } from '@/lib/firebase';

// The one cache entry every term read shares: all of an institution's terms, as read. useInstitutionTerms() (every
// term dropdown) and useInstitutionAcademicCalendar() (the active year's terms) both use it, so signing in reads the
// terms once. Kept apart from the hooks so neither has to import the other.

export type InstitutionTerm = TermDocument & { id: string };

export function termsQueryKey(institutionId: string) {
  return ['terms', institutionId] as const;
}

export async function fetchTerms(institutionId: string): Promise<InstitutionTerm[]> {
  const snap = await getDocs(institutionCollection(institutionId, 'terms'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TermDocument) }));
}
