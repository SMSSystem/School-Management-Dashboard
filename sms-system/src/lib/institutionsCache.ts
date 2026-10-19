import type { QueryClient } from '@tanstack/react-query';

// The cache keys of the platform's institutions reads, kept apart from the hook so they can be tested without
// Firebase. Everything cached under the root (the whole list, the dashboard's pages, recent sign-ups, platform head
// counts) is dropped together when an institution is created or changed.
export const INSTITUTIONS_ROOT = 'institutions';
export const allInstitutionsKey = [INSTITUTIONS_ROOT, 'all'] as const;

export function invalidateInstitutionsIn(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: [INSTITUTIONS_ROOT] });
}
