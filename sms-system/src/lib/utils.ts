/**
 * filterByInstitution
 *
 * Narrows a data array to records belonging to the current user's institution.
 *
 * Precedence rules:
 *  - institutionId === '*'  (super_admin)  → all records returned, no filter applied
 *  - institutionId === null (unauthenticated edge case) → all records returned
 *  - Record has no institutionId field → record is included
 *    (safe for mock data that predates the multi-tenancy data layer)
 *  - Record has institutionId set → included only when it matches
 *
 * This function is a no-op against the current mock data (which carries no
 * institutionId fields) and activates automatically once real Firestore
 * documents — which will include institutionId on every record — are wired up.
 *
 * Usage in list pages:
 *   const { role, institutionId } = useAuth();
 *   <Table data={filterByInstitution(rawData, institutionId)} ... />
 *
 * Usage in Firestore queries (when data layer is built):
 *   Prefer server-side filtering with a where() clause:
 *   query(collection(db, 'teachers'), where('institutionId', '==', institutionId))
 *   Use this function as a client-side safety net on top of that query.
 */
/** Number of rows shown per page across all list pages. */
export const PAGE_SIZE = 20;

export function filterByInstitution<T>(
  items: T[],
  institutionId: string | null
): T[] {
  // Super admin (*) and unauthenticated edge cases see everything.
  if (!institutionId || institutionId === '*') return items;

  return items.filter((item) => {
    if (item === null || typeof item !== 'object') return true;
    const record = item as Record<string, unknown>;
    // Records without institutionId are treated as globally visible (mock-data safe).
    return !('institutionId' in record) || record.institutionId === institutionId;
  });
}

/**
 * filterBySearch
 *
 * Narrows a data array to records where at least one of the specified fields
 * contains the search term (case-insensitive substring match).
 *
 * - Empty / whitespace-only search term returns the full array unchanged.
 * - Array-valued fields (e.g. subjects: string[]) are joined with a space
 *   before comparison, so "Math" matches ["Math", "Science"].
 * - null / undefined field values are skipped (never match).
 *
 * Usage in list pages:
 *   const searchedData = filterBySearch(filteredData, search, ['name', 'email']);
 *
 * When Firestore queries replace mock data, swap this client-side filter for a
 * server-side where() / full-text search query and remove this call.
 */
export function filterBySearch<T>(
  items: T[],
  search: string,
  keys: (keyof T)[]
): T[] {
  if (!search.trim()) return items;
  const q = search.trim().toLowerCase();
  return items.filter((item) =>
    keys.some((key) => {
      const val = item[key];
      if (val == null) return false;
      if (Array.isArray(val)) return (val as unknown[]).join(' ').toLowerCase().includes(q);
      return `${val}`.toLowerCase().includes(q);
    })
  );
}
