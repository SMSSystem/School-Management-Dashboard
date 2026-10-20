import { increment, type FieldValue, type WriteBatch } from 'firebase/firestore';
import { institutionDoc } from './paths';
import type { StoredPopulation } from './classPopulationDelta';

/**
 * Adds a student change's head-count increments (classPopulationDelta.ts) to the batch that already writes the student.
 * One update per class touched, with only the buckets that change, as dot paths so a class that has no `population` yet
 * gets one and the other buckets are never overwritten. The classes in the delta exist (populationDelta drops the rest),
 * so the update cannot fail on a missing document.
 */
export function addPopulationDelta(batch: WriteBatch, institutionId: string, delta: Record<string, StoredPopulation>): void {
  for (const [classId, d] of Object.entries(delta)) {
    const fields: Record<string, FieldValue> = {};
    if (d.male !== 0) fields['population.male'] = increment(d.male);
    if (d.female !== 0) fields['population.female'] = increment(d.female);
    if (d.unspecified !== 0) fields['population.unspecified'] = increment(d.unspecified);
    batch.update(institutionDoc(institutionId, 'classes', classId), fields);
  }
}
