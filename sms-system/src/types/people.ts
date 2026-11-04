// People: roles, user documents and the links between parents and students.
// Part of what src/lib/firebase.ts re-exports, so `import { X } from '@/lib/firebase'` keeps working.
// Keep this file free of imports from firebase.ts: it holds shapes, not the Firebase app.

import type { Timestamp } from 'firebase/firestore';

export type Role = 'super_admin' | 'institution_admin' | 'senior_teacher' | 'regular_teacher' | 'student' | 'parent' | 'spectator';

/** @expected-unused -- records this Firestore document's shape */
export type TeacherType = 'regular' | 'senior';

export type UserStatus = 'active' | 'inactive';

/** @expected-unused -- records this Firestore document's shape */
export type ParentDocument = {
  institutionId: string;
  phone?: string;
  address?: string;
};

export type UserDocument = {
  role: Role;
  name: string;
  institutionId: string;
  phone?: string;
  phone2?: string | null;
  idNumber?: string | null;
  // Set true at creation time on every account an admin creates — both
  // AdminCreateUserForm.tsx's single-account flow (including when embedded
  // by ConvertToAccountsPanel.tsx for registration conversions) and the
  // Students bulk-import target (see
  // docs/miscellaneous-specs/SPREADSHEET_IMPORT_STUDENTS_SPEC.md) — since
  // either way, the password was chosen by someone other than the account
  // owner. Cleared by the account owner once they complete the forced
  // first-login password change (Protected.tsx's gate). Omitted (not false)
  // on accounts predating this field.
  mustChangePassword?: boolean;
  // First-login emails (docs/miscellaneous-specs/INSTITUTION_LOGIN_EMAILS_SPEC.md):
  // stamped by an institution_admin's browser after a successful send, read back
  // for the 24-hour cooldown and the lifetime cap. The owner cannot write them
  // (the owner allow-list in firestore.rules does not list them).
  credentialsEmailedAt?: Timestamp;
  credentialsEmailCount?: number;
  address?: string;
  status?: 'active' | 'inactive';
  department?: string;
  emergencyContact?: string;
  linkedAccounts?: string;
  canGenerateSchedule?: boolean;
  // Senior teacher homeroom assignment
  assignedClassId?: string | null;
  assignedClassName?: string | null;
  // Senior teacher homeroom physical location — required (in the UI) once
  // assignedClassId is set; building is optional for single-building campuses.
  homeroomRoom?: string | null;
  homeroomBuilding?: string | null;
  // Student class assignment
  classId?: string | null;
  // Student profile extensions
  institutionStudentId?: string | null;
  dateOfBirth?: string | null;   // ISO "YYYY-MM-DD"
  gender?: 'Male' | 'Female' | null;
  houseId?: string | null;
  houseName?: string | null;
  toursCompleted?: Record<string, boolean>;
};

// Subcollection doc: users/{uid}/photo/current (fixed doc ID, no history).
// Deliberately not a field on UserDocument — see
// docs/miscellaneous-specs/PHOTO_UPLOAD_SPEC.md §Background/§Design
// Decisions: the users collection is read broadly and unpaginated by the
// Student/Teacher list pages, so keeping the (multi-KB) photo off that
// document means those listeners never transfer it.
export type UserPhotoDocument = {
  dataUrl: string; // "data:image/jpeg;base64,..." | "data:image/png;base64,..." | "data:image/webp;base64,..."
  // Denormalized rather than resolved via get(users/{uid}) in the Firestore
  // rule — required because AdminCreateUserForm.tsx writes this document in
  // the SAME batch as the user document's own first-ever creation. Firestore
  // rules' get() sees pre-batch state, so a get() on users/{uid} at that
  // moment hits a document that doesn't exist yet and fails the whole
  // (atomic) batch. See firestore.rules' users/{uid}/photo/{photoId} block.
  institutionId: string;
  updatedAt: Timestamp;
  updatedBy: string; // uid of the admin who set it
};

export type ParentRelationship = 'mother' | 'father' | 'guardian' | 'other';

/** @expected-unused -- records this Firestore document's shape */
export type StudentParentLink = {
  parentId: string;
  studentId: string;
  institutionId: string;
  relationship?: ParentRelationship;
};

export function getRoleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    super_admin: 'Super Admin',
    institution_admin: 'Admin',
    senior_teacher: 'Senior Teacher',
    regular_teacher: 'Regular Teacher',
    student: 'Student',
    parent: 'Parent',
    spectator: 'Spectator',
  };
  return labels[role];
}
