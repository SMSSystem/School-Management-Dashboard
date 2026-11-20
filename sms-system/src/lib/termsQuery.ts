import { institutionCollection } from '@/lib/paths';
import type { TermDocument } from '@/lib/firebase';
import { docsThrough } from '@/lib/offline/workingCopyReads';

// The one cache entry every term read shares: all of an institution's terms, as read. useInstitutionTerms() (every
// term dropdown) and useInstitutionAcademicCalendar() (the active year's terms) both use it, so signing in reads the
// terms once. Kept apart from the hooks so neither has to import the other.

export type InstitutionTerm = TermDocument & { id: string };

export function termsQueryKey(institutionId: string) {
  return ['terms', institutionId] as const;
}

/** With a working copy for staff, so the registers still know the term offline. */
export function fetchTerms(institutionId: string): Promise<InstitutionTerm[]> {
  return docsThrough<InstitutionTerm>(`terms:${institutionId}`, institutionCollection(institutionId, 'terms'));
}
