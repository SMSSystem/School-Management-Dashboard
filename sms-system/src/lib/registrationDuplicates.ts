// Admin-side duplicate detection for enrollment registrations. The public
// registration form cannot compute this itself — it has no read access to
// other registrations or to existing students (see
// STUDENT_REGISTRATION_FORM_SPEC.md's Duplicate Detection correction) — so
// this runs against data only the reviewing admin's client can read.
import type { EnrollmentRegistrationDocument } from './firebase';

type MinimalStudent = { firstName: string; lastName: string; dateOfBirth: string };

function normalizeName(first: string, last: string): string {
  return `${first.trim().toLowerCase()} ${last.trim().toLowerCase()}`;
}

function studentKey(s: MinimalStudent): string {
  return `${normalizeName(s.firstName, s.lastName)}|${s.dateOfBirth}`;
}

function registrationKey(reg: { academicYearName: string; student: MinimalStudent }): string {
  return `${reg.academicYearName}|${studentKey(reg.student)}`;
}

// For each registration, determines whether it name+DOB-matches another
// registration in the same academic year, or an existing student. Returns
// only the entries whose computed value differs from what's currently
// stored, so the caller only writes what actually changed.
//
// Indexes candidates by key once (O(n+m)) instead of scanning every other
// registration/student for every registration (O(n²+n·m)) — at realistic
// admissions-batch scale this was never actually slow, but the indexed
// version is no more complex and costs nothing extra
// (STUDENT_REGISTRATION_FORM_CODE_REVIEW_FINDINGS.md #19).
export function computePossibleDuplicates(
  registrations: (EnrollmentRegistrationDocument & { id: string })[],
  existingStudents: MinimalStudent[],
): { id: string; possibleDuplicate: boolean }[] {
  const updates: { id: string; possibleDuplicate: boolean }[] = [];

  // A rejected registration was explicitly determined not to be a valid
  // enrollment — matching against it would flag a legitimate resubmission as
  // a "possible duplicate" forever, with no way to clear it short of
  // deleting the old rejected doc (#10) — so it's excluded from the
  // candidate index. It still gets its own "self" lookup below, same as any
  // other registration. A converted registration stays a valid match
  // candidate on purpose: a second submission for an already-enrolled
  // student is still a meaningful signal for the reviewing admin.
  const registrationsByKey = new Map<string, Set<string>>();
  registrations.forEach((r) => {
    if (r.status === 'rejected') return;
    const key = registrationKey(r);
    const bucket = registrationsByKey.get(key);
    if (bucket) bucket.add(r.id);
    else registrationsByKey.set(key, new Set([r.id]));
  });

  const existingStudentKeys = new Set(existingStudents.map(studentKey));

  registrations.forEach((reg) => {
    const candidates = registrationsByKey.get(registrationKey(reg));
    const matchesOtherRegistration = !!candidates && [...candidates].some((id) => id !== reg.id);
    const matchesExistingStudent = existingStudentKeys.has(studentKey(reg.student));

    const computed = matchesOtherRegistration || matchesExistingStudent;
    if (computed !== reg.possibleDuplicate) {
      updates.push({ id: reg.id, possibleDuplicate: computed });
    }
  });

  return updates;
}
