// The head-count stored on each class document, and how a change to a student moves it. No Firebase import, so the
// rules are cheap to test and the writers can share them (the batch update itself is in classPopulationWrite.ts).
//
//   classes/{classId}.population         = { male, female, unspecified }   active students of the class
//   classes/{classId}.populationBaseline = server timestamp                 set only by a recount
//
// A student counts in EVERY class of their `classIds` (home and additional, lib/studentClasses.ts), by gender, and only
// while the account is active (a missing status is active, lib/accountStatus.ts). Writers add increments to the batch
// that changes the student; increments commute, so two admins editing at once cannot lose an update. The readers use
// `population` only once `populationBaseline` exists, because an increment on a class that was never counted holds
// only the changes since then; a recount (classPopulationQueries.ts) writes the true numbers and the baseline.

import { isAccountInactive } from './accountStatus';
import type { GenderCounts } from './classPopulation';

export type StoredPopulation = { male: number; female: number; unspecified: number };
type Bucket = keyof StoredPopulation;
const BUCKETS: readonly Bucket[] = ['male', 'female', 'unspecified'];

/** What a student contributes: the classes they are in, their gender, and whether the account is active. */
export type StudentCountState = { classIds: readonly string[]; gender?: unknown; status?: unknown };

/** Male and Female as the forms write them; anything else (or nothing) is "unspecified", as in GenderCounts. */
export function bucketOf(gender: unknown): Bucket {
  return gender === 'Male' ? 'male' : gender === 'Female' ? 'female' : 'unspecified';
}

const contributions = (s: StudentCountState | null): Map<string, Bucket> => {
  const out = new Map<string, Bucket>();
  if (!s || isAccountInactive(s.status)) return out;
  const bucket = bucketOf(s.gender);
  for (const classId of s.classIds) if (classId) out.set(classId, bucket);
  return out;
};

/**
 * The increments a change to one student makes, per class: `before` is how they were (null when they did not exist) and
 * `after` how they will be (null when they are deleted). Only classes in `existingClassIds` appear (a student whose
 * home class was deleted still lists the dead id, and updating a class document that is gone would fail the whole
 * batch), and only the buckets that change; an unchanged student gives {}.
 */
export function populationDelta(
  before: StudentCountState | null,
  after: StudentCountState | null,
  existingClassIds: ReadonlySet<string>,
): Record<string, StoredPopulation> {
  const was = contributions(before);
  const will = contributions(after);
  const out: Record<string, StoredPopulation> = {};
  for (const classId of new Set([...was.keys(), ...will.keys()])) {
    if (!existingClassIds.has(classId)) continue;
    const d: StoredPopulation = { male: 0, female: 0, unspecified: 0 };
    const b = was.get(classId);
    const a = will.get(classId);
    if (b) d[b] -= 1;
    if (a) d[a] += 1;
    if (BUCKETS.some((k) => d[k] !== 0)) out[classId] = d;
  }
  return out;
}

/** The class's stored head-count, or undefined while it has not been recounted (the six count() queries are used then). */
export function storedPopulationOf(cls: { population?: unknown; populationBaseline?: unknown }): GenderCounts | undefined {
  if (cls.populationBaseline == null) return undefined;
  const p = cls.population as Partial<StoredPopulation> | null | undefined;
  if (!p || typeof p !== 'object') return undefined;
  // a drifted counter is never shown as a negative number
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0);
  const male = n(p.male);
  const female = n(p.female);
  const unspecified = n(p.unspecified);
  return { total: male + female + unspecified, male, female, unspecified };
}
