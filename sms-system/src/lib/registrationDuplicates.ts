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

function isMatch(a: MinimalStudent, b: MinimalStudent): boolean {
  return normalizeName(a.firstName, a.lastName) === normalizeName(b.firstName, b.lastName) && a.dateOfBirth === b.dateOfBirth;
}

// For each registration, determines whether it name+DOB-matches another
// registration in the same academic year, or an existing student. Returns
// only the entries whose computed value differs from what's currently
// stored, so the caller only writes what actually changed.
export function computePossibleDuplicates(
  registrations: (EnrollmentRegistrationDocument & { id: string })[],
  existingStudents: MinimalStudent[],
): { id: string; possibleDuplicate: boolean }[] {
  const updates: { id: string; possibleDuplicate: boolean }[] = [];

  registrations.forEach((reg, i) => {
    const self: MinimalStudent = {
      firstName: reg.student.firstName,
      lastName: reg.student.lastName,
      dateOfBirth: reg.student.dateOfBirth,
    };

    const matchesOtherRegistration = registrations.some((other, j) => {
      if (i === j) return false;
      // A rejected registration was explicitly determined not to be a valid
      // enrollment — matching against it would flag a legitimate resubmission
      // as a "possible duplicate" forever, with no way to clear it short of
      // deleting the old rejected doc (STUDENT_REGISTRATION_FORM_CODE_REVIEW_FINDINGS.md #10).
      // A converted registration stays a valid match candidate on purpose: a
      // second submission for an already-enrolled student is still a
      // meaningful signal for the reviewing admin.
      if (other.status === 'rejected') return false;
      if (other.academicYearName !== reg.academicYearName) return false;
      return isMatch(self, {
        firstName: other.student.firstName,
        lastName: other.student.lastName,
        dateOfBirth: other.student.dateOfBirth,
      });
    });

    const matchesExistingStudent = existingStudents.some((s) => isMatch(self, s));

    const computed = matchesOtherRegistration || matchesExistingStudent;
    if (computed !== reg.possibleDuplicate) {
      updates.push({ id: reg.id, possibleDuplicate: computed });
    }
  });

  return updates;
}
