// Pure decisions for scripts/recount-class-populations.mjs (no I/O, so they can be unit tested from
// src/lib/__tests__/recountClassPopulation.test.ts). The rule is the one the app applies in
// src/lib/classPopulationDelta.ts and src/lib/studentClasses.ts: a student counts in every class of their classIds (the
// home class first, then the stored list, without repeats), by gender, only while the account is not 'inactive'. A test
// runs both over the same students so they cannot drift.

const asId = (v) => (typeof v === 'string' ? v : '');

/** Every class of a student: the home class, then the stored list, without repeats (lib/studentClasses.ts classIdsOf). */
export function classIdsOf(student) {
  const home = asId(student.classId);
  const stored = Array.isArray(student.classIds) ? student.classIds.map(asId).filter(Boolean) : [];
  return [...new Set([...(home ? [home] : []), ...stored])];
}

/** 'male' | 'female' | 'unspecified', as the forms write Male and Female. */
export function bucketOf(gender) {
  return gender === 'Male' ? 'male' : gender === 'Female' ? 'female' : 'unspecified';
}

/**
 * Active students per existing class, by gender. `students` are { classId, classIds, gender, status };
 * `classIds` is the set of classes that exist (a student's dead class id is ignored). A class nobody is in gets zeros.
 */
export function tallyPopulation(students, classIds) {
  const out = new Map([...classIds].map((id) => [id, { male: 0, female: 0, unspecified: 0 }]));
  for (const s of students) {
    if (s.status === 'inactive') continue;
    const bucket = bucketOf(s.gender);
    for (const id of classIdsOf(s)) {
      const counts = out.get(id);
      if (counts) counts[bucket] += 1;
    }
  }
  return out;
}

/**
 * One row per class: the numbers a recount would store, what is stored now, and whether they differ.
 * `classes` are { id, name, population, populationBaseline }.
 */
export function planRecount(classes, tally) {
  return classes.map((c) => {
    const counted = tally.get(c.id) ?? { male: 0, female: 0, unspecified: 0 };
    const stored = c.population && typeof c.population === 'object' ? c.population : null;
    const same =
      !!stored &&
      c.populationBaseline != null &&
      stored.male === counted.male &&
      stored.female === counted.female &&
      stored.unspecified === counted.unspecified;
    return { id: c.id, name: c.name, counted, stored, hadBaseline: c.populationBaseline != null, changed: !same };
  });
}
