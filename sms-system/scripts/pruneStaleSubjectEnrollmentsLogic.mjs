// Pure decisions for scripts/prune-stale-subject-enrollments.mjs (no I/O, so they
// can be unit tested from src/lib/__tests__/pruneStaleSubjectEnrollments.test.ts).
// The rule is the same one src/lib/subjectEnrollments.ts applies in the app (a test
// runs both over the same cases so they cannot drift).

/**
 * True when an enrollment no longer matches its subject: the subject does not exist,
 * or it is scoped to specific classes and this class is not among them. A subject
 * for the whole institution (or an older one with no scope) enrols every class.
 */
export function isStaleEnrollment(enrollment, subjectsById) {
  const subject = subjectsById.get(enrollment.subjectId);
  if (!subject) return true;
  if (subject.classScope === 'class') return !(subject.classIds ?? []).includes(enrollment.classId);
  return false;
}

/**
 * Splits one institution's enrollments into the ones to keep and the stale ones, each
 * stale one with the reason: 'no such subject' or 'class not in the subject'.
 * `enrollments` are { id, subjectId, classId, ... }; `subjects` are { id, classScope, classIds }.
 */
export function planPrune(enrollments, subjects) {
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const keep = [];
  const stale = [];
  for (const e of enrollments) {
    if (!isStaleEnrollment(e, byId)) {
      keep.push(e);
    } else {
      stale.push({ ...e, reason: byId.has(e.subjectId) ? 'class not in the subject' : 'no such subject' });
    }
  }
  return { keep, stale };
}
