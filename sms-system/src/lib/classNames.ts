// Class documents are referenced everywhere by id, and a user document stores
// only `classId` (no denormalised name), so any screen that shows a class has to
// look the name up. Pure, so the fallback behaviour is unit-tested.

export type ClassRef = { id: string; name: string };

// The class's name, or `fallback` when there is no class (or it no longer exists,
// or the list has not loaded yet). Never returns the raw id: an id on screen is
// a bug, whereas a dash is an honest "unknown".
export function classNameOf(
  classes: ClassRef[] | undefined,
  classId: string | null | undefined,
  fallback = '—',
): string {
  if (!classId) return fallback;
  return classes?.find((c) => c.id === classId)?.name ?? fallback;
}

// id -> name map for a table that looks up many rows.
export function classNameMap(classes: ClassRef[] | undefined): Record<string, string> {
  return Object.fromEntries((classes ?? []).map((c) => [c.id, c.name]));
}
