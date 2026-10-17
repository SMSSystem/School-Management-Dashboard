// Pure helpers for the Classes "Population" column and the Houses "Class" and
// "Students" columns. No Firebase import, so they are cheap to unit-test and to
// import from code that only needs the query-key root. The count() aggregations
// themselves are in classPopulationQueries.ts.

import { isAccountInactive } from './accountStatus';

/** Query-key root; allow-listed for persistence (a head-count is not personal data). */
export const CLASS_POPULATION_ROOT = 'classPopulation';

// 'byGender' marks the shape of the cached value (an object, where it used to be a bare number), so a
// head-count persisted by an older version is never read as the new shape.
export function classPopulationKey(institutionId: string, classId: string) {
  return [CLASS_POPULATION_ROOT, institutionId, classId, 'byGender'] as const;
}

/**
 * Active students in a class = all students minus the deactivated ones. Done as a
 * subtraction of two count() aggregations because `status != 'inactive'` (or
 * `status == 'active'`) would silently drop older users that have no `status`
 * field, which lib/accountStatus.ts treats as active.
 */
export function activePopulation(total: number, inactive: number): number {
  return Math.max(0, total - Math.max(0, inactive));
}

/** Active students of a class (or house) by gender; `unspecified` has neither "Male" nor "Female" recorded. */
export type GenderCounts = { total: number; male: number; female: number; unspecified: number };

/**
 * The six count() aggregations of one class -> active students by gender. Each gender has its own
 * deactivated count to subtract (see activePopulation), so Male + Female + unspecified is always the
 * Population figure.
 */
export function activeGenderCounts(c: {
  total: number;
  inactive: number;
  male: number;
  maleInactive: number;
  female: number;
  femaleInactive: number;
}): GenderCounts {
  const total = activePopulation(c.total, c.inactive);
  const male = activePopulation(c.male, c.maleInactive);
  const female = activePopulation(c.female, c.femaleInactive);
  return { total, male, female, unspecified: Math.max(0, total - male - female) };
}

/** Students already in hand (the class detail page's list) -> the same split the count() queries give. */
export function countByGender(students: { gender?: unknown }[]): GenderCounts {
  const male = students.filter((s) => s.gender === 'Male').length;
  const female = students.filter((s) => s.gender === 'Female').length;
  return { total: students.length, male, female, unspecified: students.length - male - female };
}

/**
 * "M 12 · F 12" (short, for the table) or "12 male, 12 female" (full, for the tooltip and screen
 * readers). "unspecified N" is added only when some students have no gender recorded.
 */
export function formatGenderBreakdown(c: GenderCounts, style: 'short' | 'full'): string {
  if (style === 'short') {
    const parts = [`M ${c.male}`, `F ${c.female}`];
    if (c.unspecified > 0) parts.push(`unspecified ${c.unspecified}`);
    return parts.join(' · ');
  }
  const parts = [`${c.male} male`, `${c.female} female`];
  if (c.unspecified > 0) parts.push(`${c.unspecified} unspecified`);
  return parts.join(', ');
}

export type HouseSummary = {
  count: number;
  male: number;
  female: number;
  unspecified: number;
  classNames: string[];
  classIds: string[];
};

// A user document's shape varies by role, so only the fields read here are named.
type UserLike = Record<string, unknown>;

/**
 * Per house: how many (active) students it has and which classes they are in.
 * A house spans classes by design (a student carries both `houseId` and
 * `classId`), so the class names are the distinct classes of its students,
 * sorted A-Z. A student with no class counts towards the house but adds no name.
 */
export function summariseHouses(
  users: UserLike[] | undefined,
  classNameById: Record<string, string>,
): Record<string, HouseSummary> {
  const counts: Record<string, number> = {};
  const genders: Record<string, { male: number; female: number }> = {};
  const names: Record<string, Set<string>> = {};
  const ids: Record<string, Set<string>> = {};
  for (const u of users ?? []) {
    if (u.role !== 'student' || isAccountInactive(u.status)) continue;
    const houseId = typeof u.houseId === 'string' ? u.houseId : '';
    if (!houseId) continue;
    counts[houseId] = (counts[houseId] ?? 0) + 1;
    const g = (genders[houseId] ??= { male: 0, female: 0 });
    if (u.gender === 'Male') g.male += 1;
    else if (u.gender === 'Female') g.female += 1;
    const classId = typeof u.classId === 'string' ? u.classId : '';
    const name = classId ? classNameById[classId] : undefined;
    if (name) (names[houseId] ??= new Set()).add(name);
    // Every class the house's students are in, named or not, so the Houses class filter matches.
    if (classId) (ids[houseId] ??= new Set()).add(classId);
  }
  const out: Record<string, HouseSummary> = {};
  for (const houseId of Object.keys(counts)) {
    const { male, female } = genders[houseId];
    out[houseId] = {
      count: counts[houseId],
      male,
      female,
      unspecified: counts[houseId] - male - female,
      classNames: [...(names[houseId] ?? [])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      classIds: [...(ids[houseId] ?? [])].sort(),
    };
  }
  return out;
}

/** "1A, 1B +2" for the cell, and the full list for its tooltip. */
export function shortList(names: string[], max = 3): { text: string; full: string } {
  const full = names.join(', ');
  if (names.length <= max) return { text: full, full };
  return { text: `${names.slice(0, max).join(', ')} +${names.length - max}`, full };
}
