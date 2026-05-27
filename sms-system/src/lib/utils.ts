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
