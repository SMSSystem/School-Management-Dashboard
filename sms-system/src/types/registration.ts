// Student registration: the public form submissions and the directory the form reads.
// Part of what src/lib/firebase.ts re-exports, so `import { X } from '@/lib/firebase'` keeps working.
// Keep this file free of imports from firebase.ts: it holds shapes, not the Firebase app.

import type { Timestamp } from 'firebase/firestore';

export type RegistrationStatus = 'pending' | 'reviewed' | 'converted' | 'rejected';

export type RegistrationGuardian = {
  lastName: string;
  firstName: string;
  address: string;
  contact: string;
  email: string;
  occupation: string;
  work?: string;
};

export type EnrollmentRegistrationDocument = {
  institutionId: string;
  academicYearId: string;
  academicYearName: string;
  status: RegistrationStatus;
  submittedAt: Timestamp | string;
  reviewedAt?: Timestamp | string;
  reviewedBy?: string;
  possibleDuplicate: boolean;
  student: {
    lastName: string;
    firstName: string;
    middleName?: string;
    requestedClass: string;
    dateOfBirth: string;
    gender: 'Male' | 'Female';
    email: string;
    lastSchoolAttended?: string;
    photoDataUrl?: string; // same "data:image/...;base64,..." shape as UserPhotoDocument.dataUrl
  };
  mother: RegistrationGuardian | null;
  father: RegistrationGuardian | null;
  convertedStudentUid?: string;
  convertedMotherUid?: string;
  convertedFatherUid?: string;
};

// Denormalized onto registration_directory alongside name/logoUrl — the
// public registration form reads activeAcademicYearId/Name directly instead
// of institutions/{id}/academicYears, which it cannot read (isSignedIn()
// only). See STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md "Corrections
// found while planning" #1.
export type RegistrationDirectoryEntry = {
  name: string;
  logoUrl?: string;
  acceptingRegistrations: boolean;
  activeAcademicYearId?: string;
  activeAcademicYearName?: string;
  // calendarMode === 'custom' institutions only (CUSTOM_CALENDAR_MODE_SPEC.md
  // §5.4/§6) — every currently active time block, since there's no longer
  // one "the" active year to silently default to. The registration form
  // itself infers custom-mode-ness from this being present/non-empty rather
  // than a separate flag, since it can't read institutions/{id}.calendarMode
  // directly (that doc isn't public).
  openTimeBlocks?: { academicYearId: string; name: string; startDate: string; endDate: string }[];
  updatedAt: Timestamp | string;
  updatedBy: string;
};
