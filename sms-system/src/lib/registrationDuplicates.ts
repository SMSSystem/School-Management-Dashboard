// Admin-side duplicate detection for enrollment registrations. The public
// registration form cannot compute this itself — it has no read access to
// other registrations or to existing students (see
// STUDENT_REGISTRATION_FORM_SPEC.md's Duplicate Detection correction) — so
// this runs against data only the reviewing admin's client can read.
//
// STUB (Phase 8 of STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md): the
// real name+DOB matching logic lands in Phase 9. This stub exists only so
// RegistrationReviewPage's call site (already wired in Phase 8) type-checks
// and runs safely — it never flags anything as a duplicate yet.
import type { EnrollmentRegistrationDocument } from './firebase';

type MinimalStudent = { firstName: string; lastName: string; dateOfBirth: string };

export function computePossibleDuplicates(
  _registrations: (EnrollmentRegistrationDocument & { id: string })[],
  _existingStudents: MinimalStudent[],
): { id: string; possibleDuplicate: boolean }[] {
  return [];
}
