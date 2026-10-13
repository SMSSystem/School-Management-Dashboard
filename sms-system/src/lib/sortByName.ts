// Shared alphabetical-by-displayed-name sort (POST_MERGE_DEV_NOTES_IMPLEMENTATION_PLAN.md
// §2.3). Sorts on the full name exactly as shown in the UI — no surname
// extraction — so a visibly top-to-bottom-alphabetical column actually reads
// that way, rather than being alphabetical by a hidden last-word key while
// the displayed (first-name-led) string looks unsorted.

/** Returns a new, sorted array — does not mutate `items`. */
export function sortByName<T>(items: T[], nameOf: (item: T) => string): T[] {
  return [...items].sort(byName(nameOf));
}

/** A comparator for direct use in `.sort()`/`Array.prototype.sort` call sites
 * that already have an array reference to sort in place. */
export function byName<T>(nameOf: (item: T) => string): (a: T, b: T) => number {
  return (a, b) => nameOf(a).localeCompare(nameOf(b));
}

/**
 * Natural, case-insensitive order for names that mix numbers and letters
 * (classes, houses, subjects): "1A", "2B", "10A" (not "1A", "10A", "2B"), and digits
 * before letters. Use it for the first column of a list; `byName` above stays the plain
 * order for people.
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Returns a new array in natural order of the displayed name. */
export function sortByNameNatural<T>(items: T[], nameOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => naturalCompare(nameOf(a), nameOf(b)));
}
